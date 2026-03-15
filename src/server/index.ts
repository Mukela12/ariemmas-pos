import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
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

// --- Sales Export (Excel) ---
app.get('/api/sales/export', async (req, res) => {
  const date = req.query.date as string
  if (!date) return res.status(400).json({ error: 'date query parameter required' })

  const sales = await db.query<any>(`
    SELECT s.receipt_number, s.created_at, u.display_name as cashier,
      s.payment_method, s.subtotal, s.vat_total, s.total,
      s.amount_tendered, s.change_given, s.mobile_ref, s.status
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.created_at::date = $1 AND s.status = 'completed'
    ORDER BY s.created_at ASC
  `, [date])

  const items = await db.query<any>(`
    SELECT s.receipt_number, si.product_name, si.barcode, si.quantity,
      si.unit_price, si.vat_rate, si.vat_amount, si.line_total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.created_at::date = $1 AND s.status = 'completed'
    ORDER BY s.created_at ASC, si.product_name ASC
  `, [date])

  const dateFormatted = dayjs(date).format('DD-MMM-YYYY')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ariemmas POS'
  wb.created = new Date()

  // Sales Summary sheet
  const ws = wb.addWorksheet('Sales Summary')
  ws.mergeCells('A1:H1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `Ariemmas — Daily Sales Report (${dateFormatted})`
  titleCell.font = { size: 14, bold: true }
  ws.addRow([])

  const totalRevenue = sales.reduce((s: number, r: any) => s + Number(r.total), 0)
  const totalVat = sales.reduce((s: number, r: any) => s + Number(r.vat_total), 0)
  const cashSales = sales.filter((r: any) => r.payment_method === 'cash').reduce((s: number, r: any) => s + Number(r.total), 0)
  const mobileSales = sales.filter((r: any) => r.payment_method === 'mobile_money').reduce((s: number, r: any) => s + Number(r.total), 0)

  ws.addRow(['Total Transactions', sales.length])
  ws.addRow(['Total Revenue', totalRevenue])
  ws.addRow(['Total VAT', totalVat])
  ws.addRow(['Cash Sales', cashSales])
  ws.addRow(['Mobile Money Sales', mobileSales])
  ws.addRow([])

  const headerRow = ws.addRow(['Receipt #', 'Time', 'Cashier', 'Payment', 'Subtotal', 'VAT', 'Total', 'Status'])
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  for (const sale of sales) {
    ws.addRow([
      sale.receipt_number,
      dayjs(sale.created_at).format('HH:mm:ss'),
      sale.cashier || 'Unknown',
      sale.payment_method === 'mobile_money' ? 'Mobile Money' : 'Cash',
      Number(sale.subtotal), Number(sale.vat_total), Number(sale.total), sale.status
    ])
  }

  for (const col of [5, 6, 7]) ws.getColumn(col).numFmt = '#,##0.00'
  ws.getColumn(1).width = 18; ws.getColumn(2).width = 10; ws.getColumn(3).width = 18
  ws.getColumn(4).width = 14; ws.getColumn(5).width = 12; ws.getColumn(6).width = 12
  ws.getColumn(7).width = 12; ws.getColumn(8).width = 10

  // Line Items sheet
  const wsItems = wb.addWorksheet('Line Items')
  wsItems.mergeCells('A1:G1')
  const itemsTitle = wsItems.getCell('A1')
  itemsTitle.value = `Ariemmas — Items Sold (${dateFormatted})`
  itemsTitle.font = { size: 14, bold: true }
  wsItems.addRow([])

  const itemHeaderRow = wsItems.addRow(['Receipt #', 'Product', 'Barcode', 'Qty', 'Unit Price', 'VAT', 'Line Total'])
  itemHeaderRow.font = { bold: true }
  itemHeaderRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  for (const item of items) {
    wsItems.addRow([
      item.receipt_number, item.product_name, item.barcode || '',
      Number(item.quantity), Number(item.unit_price), Number(item.vat_amount), Number(item.line_total)
    ])
  }

  wsItems.getColumn(1).width = 18; wsItems.getColumn(2).width = 24; wsItems.getColumn(3).width = 14
  wsItems.getColumn(4).width = 8; wsItems.getColumn(5).width = 12; wsItems.getColumn(6).width = 12
  wsItems.getColumn(7).width = 12
  for (const col of [5, 6, 7]) wsItems.getColumn(col).numFmt = '#,##0.00'

  const fileName = `Ariemmas_Sales_${date}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  await wb.xlsx.write(res)
  res.end()
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

// --- Sync endpoints (desktop → cloud) ---
// All sync endpoints wrapped in try-catch to return proper JSON errors

// Sync a complete sale (idempotent — skips if sale ID already exists)
app.post('/api/sync/sales', async (req, res) => {
  try {
    const { sale, items } = req.body
    if (!sale?.id) return res.status(400).json({ error: 'Missing sale data' })

    const existing = await db.queryOne('SELECT id FROM sales WHERE id = $1', [sale.id])
    if (existing) return res.json({ status: 'already_synced' })

    // Ensure the user exists (skip FK if not)
    const userExists = await db.queryOne('SELECT id FROM users WHERE id = $1', [sale.user_id])
    if (!userExists) return res.status(422).json({ error: `User ${sale.user_id} not synced yet` })

    await db.transaction(async () => {
      // Handle receipt_number conflict (web and desktop may generate same numbers)
      let receiptNumber = sale.receipt_number
      const receiptExists = await db.queryOne('SELECT id FROM sales WHERE receipt_number = $1', [receiptNumber])
      if (receiptExists) {
        receiptNumber = receiptNumber + '-D'
      }

      await db.run(
        `INSERT INTO sales (id, receipt_number, user_id, shift_id, subtotal, vat_total, total,
          payment_method, amount_tendered, change_given, mobile_ref, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [sale.id, receiptNumber, sale.user_id, sale.shift_id, sale.subtotal,
         sale.vat_total, sale.total, sale.payment_method, sale.amount_tendered,
         sale.change_given, sale.mobile_ref, sale.status, sale.created_at]
      )

      for (const item of items || []) {
        const itemExists = await db.queryOne('SELECT id FROM sale_items WHERE id = $1', [item.id])
        if (!itemExists) {
          await db.run(
            `INSERT INTO sale_items (id, sale_id, product_id, product_name, barcode,
              quantity, unit_price, vat_rate, vat_amount, line_total)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [item.id, item.sale_id, item.product_id, item.product_name, item.barcode,
             item.quantity, item.unit_price, item.vat_rate, item.vat_amount, item.line_total]
          )
          await db.run('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.product_id])
        }
      }
    })

    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Sales error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync a product (upsert — replaces server-seeded product if barcode matches)
app.post('/api/sync/products', async (req, res) => {
  try {
    const p = req.body
    if (!p?.id) return res.status(400).json({ error: 'Missing product data' })

    const existingById = await db.queryOne('SELECT id FROM products WHERE id = $1', [p.id])
    if (existingById) {
      await db.run(
        'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, updated_at=NOW() WHERE id=$10',
        [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, p.id]
      )
      return res.json({ status: 'synced' })
    }

    // If a product with the same barcode exists (server-seeded), replace it with desktop version
    if (p.barcode) {
      const existingByBarcode = await db.queryOne<any>('SELECT id FROM products WHERE barcode = $1', [p.barcode])
      if (existingByBarcode) {
        await db.transaction(async () => {
          // Insert new product first with temp barcode (to satisfy FKs during reference update)
          await db.run(
            'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [p.id, '__sync_temp_' + p.id, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each']
          )
          await db.run('UPDATE sale_items SET product_id = $1 WHERE product_id = $2', [p.id, existingByBarcode.id])
          await db.run('DELETE FROM products WHERE id = $1', [existingByBarcode.id])
          await db.run('UPDATE products SET barcode = $1 WHERE id = $2', [p.barcode, p.id])
        })
        return res.json({ status: 'synced' })
      }
    }

    await db.run(
      'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [p.id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each']
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Product error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/sync/products/:id', async (req, res) => {
  try {
    const p = req.body
    await db.run(
      'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, updated_at=NOW() WHERE id=$10',
      [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, req.params.id]
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Product update error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync a shift (upsert)
app.post('/api/sync/shifts', async (req, res) => {
  try {
    const s = req.body
    if (!s?.id) return res.status(400).json({ error: 'Missing shift data' })

    // Ensure user exists before inserting shift
    if (s.user_id) {
      const userExists = await db.queryOne('SELECT id FROM users WHERE id = $1', [s.user_id])
      if (!userExists) return res.status(422).json({ error: `User ${s.user_id} not synced yet` })
    }

    const existing = await db.queryOne('SELECT id FROM shifts WHERE id = $1', [s.id])
    if (existing) {
      await db.run(
        `UPDATE shifts SET opening_cash=$1, closing_cash=$2, expected_cash=$3, variance=$4,
         total_sales=$5, total_transactions=$6, total_vat=$7, status=$8, notes=$9, closed_at=$10 WHERE id=$11`,
        [s.opening_cash, s.closing_cash, s.expected_cash, s.variance, s.total_sales,
         s.total_transactions, s.total_vat, s.status, s.notes, s.closed_at, s.id]
      )
    } else {
      await db.run(
        `INSERT INTO shifts (id, user_id, opening_cash, closing_cash, expected_cash, variance,
         total_sales, total_transactions, total_vat, status, notes, opened_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [s.id, s.user_id, s.opening_cash, s.closing_cash, s.expected_cash, s.variance,
         s.total_sales, s.total_transactions, s.total_vat, s.status, s.notes, s.opened_at, s.closed_at]
      )
    }
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Shift error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/sync/shifts/:id', async (req, res) => {
  try {
    const s = req.body
    await db.run(
      `UPDATE shifts SET opening_cash=$1, closing_cash=$2, expected_cash=$3, variance=$4,
       total_sales=$5, total_transactions=$6, total_vat=$7, status=$8, notes=$9, closed_at=$10 WHERE id=$11`,
      [s.opening_cash, s.closing_cash, s.expected_cash, s.variance, s.total_sales,
       s.total_transactions, s.total_vat, s.status, s.notes, s.closed_at, req.params.id]
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Shift update error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync settings
app.put('/api/sync/settings/:key', async (req, res) => {
  try {
    const { key, value } = req.body
    await db.run('UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2', [value, key || req.params.key])
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Setting error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync users (upsert — replace server-seeded user if desktop sends one with same username)
app.post('/api/sync/users', async (req, res) => {
  try {
    const u = req.body
    if (!u?.id) return res.status(400).json({ error: 'Missing user data' })

    const existingById = await db.queryOne<any>('SELECT id FROM users WHERE id = $1', [u.id])
    if (existingById) return res.json({ status: 'already_synced' })

    // If a user with the same username exists (e.g. server-seeded), replace it with the desktop version
    const existingByName = await db.queryOne<any>('SELECT id FROM users WHERE username = $1', [u.username])
    if (existingByName) {
      await db.transaction(async () => {
        // Insert new user first (temporarily allow duplicate username by using temp username)
        await db.run(
          'INSERT INTO users (id, username, display_name, pin_hash, role, active) VALUES ($1,$2,$3,$4,$5,$6)',
          [u.id, '__sync_temp_' + u.id, u.display_name, u.pin_hash, u.role, u.active]
        )
        // Update all references from old ID to new ID
        await db.run('UPDATE sales SET user_id = $1 WHERE user_id = $2', [u.id, existingByName.id])
        await db.run('UPDATE shifts SET user_id = $1 WHERE user_id = $2', [u.id, existingByName.id])
        await db.run('UPDATE audit_log SET user_id = $1 WHERE user_id = $2', [u.id, existingByName.id])
        await db.run('UPDATE draft_sales SET user_id = $1 WHERE user_id = $2', [u.id, existingByName.id])
        // Delete old user
        await db.run('DELETE FROM users WHERE id = $1', [existingByName.id])
        // Fix the username back
        await db.run('UPDATE users SET username = $1 WHERE id = $2', [u.username, u.id])
      })
    } else {
      await db.run(
        'INSERT INTO users (id, username, display_name, pin_hash, role, active) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.id, u.username, u.display_name, u.pin_hash, u.role, u.active]
      )
    }
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] User error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync categories (upsert — categories use the same IDs on both sides via seed data)
app.post('/api/sync/categories', async (req, res) => {
  try {
    const c = req.body
    if (!c?.id) return res.status(400).json({ error: 'Missing category data' })
    const existing = await db.queryOne('SELECT id FROM categories WHERE id = $1', [c.id])
    if (existing) return res.json({ status: 'already_synced' })
    await db.run(
      'INSERT INTO categories (id, name, description, sort_order, active) VALUES ($1,$2,$3,$4,$5)',
      [c.id, c.name, c.description, c.sort_order, c.active]
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Category error:', err.message)
    res.status(500).json({ error: err.message })
  }
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
