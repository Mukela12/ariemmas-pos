import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import dayjs from 'dayjs'
import { PostgresAdapter } from '../main/database/postgresAdapter'
import { runMigrations } from '../main/database/migrations'
import type { DbAdapter } from '../main/database/adapter'

const app = express()
app.use(cors())
app.use(express.json())

let db: DbAdapter

async function initDb(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  db = new PostgresAdapter({
    connectionString,
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'ariemmas_pos',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
  })

  await runMigrations(db)

  // Seed admin if no users exist
  const existing = await db.queryOne('SELECT id FROM users LIMIT 1')
  if (!existing) {
    const pinHash = bcrypt.hashSync('1234', 10)
    await db.run(
      'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [uuid(), 'admin', 'Administrator', pinHash, 'admin']
    )
    const maryHash = bcrypt.hashSync('5678', 10)
    await db.run(
      'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [uuid(), 'mary', 'Mary', maryHash, 'cashier']
    )
  }

  // Seed products if none exist
  const existingProduct = await db.queryOne('SELECT id FROM products LIMIT 1')
  if (!existingProduct) {
    const products = [
      { barcode: '2324345', name: 'Apples (1kg)', cat: 'cat-groceries', price: 55.89, cost: 40.00, stock: 120 },
      { barcode: '3121338', name: 'T-Bone Steak', cat: 'cat-meat', price: 289.99, cost: 210.00, stock: 25 },
      { barcode: '4810234', name: 'Mealie Meal 25kg', cat: 'cat-groceries', price: 85.00, cost: 65.00, stock: 48, vat: 0 },
      { barcode: '5918273', name: 'Cooking Oil 2L', cat: 'cat-groceries', price: 65.00, cost: 48.00, stock: 3, vat: 0 },
      { barcode: '6723891', name: 'Sugar 2kg', cat: 'cat-groceries', price: 45.00, cost: 32.00, stock: 67 },
      { barcode: '7834562', name: 'Bread (White)', cat: 'cat-groceries', price: 25.00, cost: 18.00, stock: 30, vat: 0 },
      { barcode: '8945123', name: 'Coca-Cola 500ml', cat: 'cat-beverages', price: 15.00, cost: 10.00, stock: 200 },
      { barcode: '9056784', name: 'Fanta Orange 500ml', cat: 'cat-beverages', price: 15.00, cost: 10.00, stock: 150 },
      { barcode: '1167345', name: 'Castle Lager 340ml', cat: 'cat-beverages', price: 22.00, cost: 15.00, stock: 100 },
      { barcode: '2278456', name: 'Mosi Lager 340ml', cat: 'cat-beverages', price: 20.00, cost: 13.00, stock: 100 },
    ]
    for (const p of products) {
      await db.run(
        'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [uuid(), p.barcode, p.name, p.cat, p.price, p.cost, (p as any).vat ?? 0.16, p.stock]
      )
    }
  }
}

// --- Auth ---
app.post('/api/auth/login', async (req, res) => {
  const { username, pin } = req.body
  const user = await db.queryOne<any>(
    'SELECT * FROM users WHERE username = $1 AND active = 1', [username]
  )
  if (!user) return res.json(null)
  if (user.locked_until && new Date(user.locked_until) > new Date()) return res.json(null)

  const valid = bcrypt.compareSync(pin, user.pin_hash)
  if (!valid) {
    const attempts = user.failed_attempts + 1
    if (attempts >= 3) {
      const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await db.run('UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3', [attempts, lockUntil, user.id])
    } else {
      await db.run('UPDATE users SET failed_attempts = $1 WHERE id = $2', [attempts, user.id])
    }
    return res.json(null)
  }

  await db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id])
  res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, active: user.active })
})

// --- Products ---
app.get('/api/products', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50
  const offset = (page - 1) * limit
  const products = await db.query('SELECT * FROM products WHERE active = 1 ORDER BY name LIMIT $1 OFFSET $2', [limit, offset])
  const countRow = await db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM products WHERE active = 1')
  res.json({ products, total: parseInt(countRow?.count || '0'), page, limit })
})

app.get('/api/products/search', async (req, res) => {
  const q = req.query.q as string || ''
  const products = await db.query(
    'SELECT * FROM products WHERE (name ILIKE $1 OR barcode LIKE $2) AND active = 1 ORDER BY name LIMIT 50',
    [`%${q}%`, `%${q}%`]
  )
  res.json(products)
})

app.get('/api/products/barcode/:barcode', async (req, res) => {
  const product = await db.queryOne('SELECT * FROM products WHERE barcode = $1 AND active = 1', [req.params.barcode])
  res.json(product)
})

app.post('/api/products', async (req, res) => {
  const p = req.body
  const id = uuid()
  await db.run(
    'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each']
  )
  const product = await db.queryOne('SELECT * FROM products WHERE id = $1', [id])
  res.json(product)
})

app.put('/api/products/:id', async (req, res) => {
  const p = req.body
  await db.run(
    'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, updated_at=NOW() WHERE id=$10',
    [p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', req.params.id]
  )
  const product = await db.queryOne('SELECT * FROM products WHERE id = $1', [req.params.id])
  res.json(product)
})

// --- Categories ---
app.get('/api/categories', async (_req, res) => {
  const cats = await db.query('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order')
  res.json(cats)
})

// --- Sales ---
app.post('/api/sales', async (req, res) => {
  const input = req.body
  const saleId = uuid()
  const today = dayjs().format('YYYYMMDD')

  await db.transaction(async () => {
    // Receipt number
    const stored = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_date'")
    if (stored?.value !== today) {
      await db.run("UPDATE settings SET value = $1 WHERE key = 'receipt_counter'", ['0'])
      await db.run("UPDATE settings SET value = $1 WHERE key = 'receipt_date'", [today])
    }
    const counter = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_counter'")
    const nextVal = String(parseInt(counter?.value || '0') + 1)
    await db.run("UPDATE settings SET value = $1 WHERE key = 'receipt_counter'", [nextVal])
    const receiptNumber = `${today}-${nextVal.padStart(4, '0')}`

    await db.run(
      `INSERT INTO sales (id, receipt_number, user_id, shift_id, subtotal, vat_total, total, payment_method, amount_tendered, change_given, mobile_ref, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed')`,
      [saleId, receiptNumber, input.user_id, input.shift_id, input.subtotal, input.vat_total, input.total, input.payment_method, input.amount_tendered, input.change_given, input.mobile_ref]
    )

    for (const item of input.items) {
      await db.run(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, barcode, quantity, unit_price, vat_rate, vat_amount, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [uuid(), saleId, item.product_id, item.name, item.barcode, item.quantity, item.price, item.vat_rate, item.vat_amount, item.line_total]
      )
      await db.run('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [item.quantity, item.product_id])
    }

    if (input.shift_id) {
      await db.run('UPDATE shifts SET total_sales = total_sales + $1, total_transactions = total_transactions + 1, total_vat = total_vat + $2 WHERE id = $3',
        [input.total, input.vat_total, input.shift_id])
    }
  })

  const sale = await db.queryOne('SELECT * FROM sales WHERE id = $1', [saleId])
  res.json(sale)
})

app.get('/api/sales/daily', async (req, res) => {
  const date = req.query.date as string
  const dateExpr = "created_at::date"

  const summary = await db.queryOne<any>(`
    SELECT COUNT(*) as total_sales, COALESCE(SUM(total),0) as total_revenue, COALESCE(SUM(vat_total),0) as total_vat,
      COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method='mobile_money' THEN total ELSE 0 END),0) as mobile_sales
    FROM sales WHERE ${dateExpr} = $1 AND status = 'completed'
  `, [date])

  const itemsRow = await db.queryOne<any>(`
    SELECT COALESCE(SUM(si.quantity),0) as items_sold FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE s.created_at::date = $1 AND s.status = 'completed'
  `, [date])

  const totalSales = Number(summary?.total_sales) || 0
  const totalRevenue = Number(summary?.total_revenue) || 0

  res.json({
    total_sales: totalSales,
    total_revenue: totalRevenue,
    total_vat: Number(summary?.total_vat) || 0,
    items_sold: Number(itemsRow?.items_sold) || 0,
    cash_sales: Number(summary?.cash_sales) || 0,
    mobile_sales: Number(summary?.mobile_sales) || 0,
    average_sale: totalSales > 0 ? totalRevenue / totalSales : 0
  })
})

// --- Shifts ---
app.post('/api/shifts/open', async (req, res) => {
  const { userId, openingCash } = req.body
  const id = uuid()
  await db.run('INSERT INTO shifts (id, user_id, opening_cash, status) VALUES ($1,$2,$3,$4)', [id, userId, openingCash, 'open'])
  const shift = await db.queryOne('SELECT * FROM shifts WHERE id = $1', [id])
  res.json(shift)
})

app.post('/api/shifts/close', async (req, res) => {
  const { shiftId, closingCash, notes } = req.body
  const shift = await db.queryOne<any>('SELECT * FROM shifts WHERE id = $1', [shiftId])
  if (!shift) return res.json(null)
  const expectedCash = Number(shift.opening_cash) + Number(shift.total_sales || 0)
  const variance = closingCash - expectedCash
  await db.run("UPDATE shifts SET closing_cash=$1, expected_cash=$2, variance=$3, notes=$4, status='closed', closed_at=NOW() WHERE id=$5",
    [closingCash, expectedCash, variance, notes, shiftId])
  const updated = await db.queryOne('SELECT * FROM shifts WHERE id = $1', [shiftId])
  res.json(updated)
})

app.get('/api/shifts/current/:userId', async (req, res) => {
  const shift = await db.queryOne("SELECT * FROM shifts WHERE user_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1", [req.params.userId])
  res.json(shift)
})

// --- Settings ---
app.get('/api/settings', async (_req, res) => {
  const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
})

app.put('/api/settings/:key', async (req, res) => {
  await db.run('UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2', [req.body.value, req.params.key])
  res.json(true)
})

// --- Health ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', engine: 'postgres' })
})

// Start
const PORT = parseInt(process.env.PORT || '3001')

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Ariemmas POS API running on port ${PORT}`)
  })
}).catch((err) => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
