import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { Resend } from 'resend'
import { PostgresAdapter } from '../main/database/postgresAdapter'
import { runMigrations } from '../main/database/migrations'
import type { DbAdapter } from '../main/database/adapter'

const app = express()
app.use(cors())
app.use(express.json())

let db: DbAdapter
let resend: Resend | null = null

function getResend(): Resend | null {
  if (resend) return resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  resend = new Resend(apiKey)
  return resend
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const existing = await db.queryOne('SELECT key FROM settings WHERE key = $1', [key])

  if (existing) {
    await db.run('UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2', [value, key])
  } else {
    await db.run('INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())', [key, value])
  }
}

async function getShiftWithCashStats(shiftId: string) {
  // Prefer the human name typed at shift open (sh.cashier_name) over the
  // generic login display_name (e.g. "Cashier 1"). Falls back to login name
  // for shifts opened before the cashier-name field existed.
  const shift = await db.queryOne<any>(`
    SELECT sh.*,
      COALESCE(sh.cashier_name, u.display_name) as cashier_name,
      COALESCE((
        SELECT SUM(s.total)
        FROM sales s
        WHERE s.shift_id = sh.id AND s.payment_method = $1 AND s.status = $2
      ), 0) as cash_sales
    FROM shifts sh
    LEFT JOIN users u ON u.id = sh.user_id
    WHERE sh.id = $3
  `, ['cash', 'completed', shiftId])

  if (!shift) return null

  const cashSales = Number(shift.cash_sales) || 0
  return {
    ...shift,
    cash_sales: cashSales,
    cash_in_drawer: Number(shift.opening_cash || 0) + cashSales
  }
}

async function getCurrentShiftForUser(userId: string) {
  const shift = await db.queryOne<{ id: string }>(
    "SELECT id FROM shifts WHERE user_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
    [userId]
  )
  if (!shift?.id) return null
  return getShiftWithCashStats(shift.id)
}

async function getCashSalesForShift(shiftId: string): Promise<number> {
  const row = await db.queryOne<{ total: string }>(
    "SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE shift_id = $1 AND payment_method = $2 AND status = $3",
    [shiftId, 'cash', 'completed']
  )
  return Number(row?.total) || 0
}

async function sendCashRegisterAlertEmail({
  to,
  threshold,
  shift,
  settings
}: {
  to: string
  threshold: number
  shift: any
  settings: Record<string, string>
}): Promise<boolean> {
  const client = getResend()
  if (!client) return false

  const from = process.env.RESEND_FROM || 'Ariemmas POS <onboarding@resend.dev>'
  const shopName = settings.shop_name || 'Ariemmas'
  const shopAddress = settings.shop_address || ''
  const openedAt = shift.opened_at ? dayjs(shift.opened_at).format('DD MMM YYYY HH:mm') : 'Unknown'

  await client.emails.send({
    from,
    to: [to],
    subject: `${shopName}: cash drawer reached K ${threshold.toFixed(2)}`,
    text: [
      `${shopName} cash drawer alert`,
      '',
      `Cash in drawer: K ${Number(shift.cash_in_drawer || 0).toFixed(2)}`,
      `Opening cash: K ${Number(shift.opening_cash || 0).toFixed(2)}`,
      `Cash sales: K ${Number(shift.cash_sales || 0).toFixed(2)}`,
      `Threshold: K ${threshold.toFixed(2)}`,
      `Cashier: ${shift.cashier_name || shift.user_id}`,
      `Shift opened: ${openedAt}`,
      shopAddress ? `Location: ${shopAddress}` : ''
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #18181B;">
        <h2 style="margin-bottom: 8px;">${shopName} cash drawer alert</h2>
        <p>The cash register has reached the configured threshold.</p>
        <table style="border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Cash in drawer</strong></td><td>K ${Number(shift.cash_in_drawer || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Opening cash</strong></td><td>K ${Number(shift.opening_cash || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Cash sales</strong></td><td>K ${Number(shift.cash_sales || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Threshold</strong></td><td>K ${threshold.toFixed(2)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Cashier</strong></td><td>${shift.cashier_name || shift.user_id}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;"><strong>Shift opened</strong></td><td>${openedAt}</td></tr>
        </table>
        ${shopAddress ? `<p style="margin-top: 16px;">${shopAddress}</p>` : ''}
      </div>
    `
  })

  return true
}

async function sendCashDrawerAlertIfNeeded(shiftId: string | null | undefined): Promise<void> {
  if (!shiftId) return

  const shift = await getShiftWithCashStats(shiftId)
  if (!shift || shift.cash_alert_sent_at) return

  const settings = await getSettingsMap()
  const threshold = parseFloat(settings.cash_alert_threshold || '2000') || 2000
  const recipient = (settings.cash_alert_email || '').trim()

  if (!recipient || Number(shift.cash_in_drawer || 0) < threshold) return

  try {
    const sent = await sendCashRegisterAlertEmail({ to: recipient, threshold, shift, settings })
    if (sent) {
      await db.run('UPDATE shifts SET cash_alert_sent_at = NOW() WHERE id = $1', [shiftId])
    }
  } catch (error) {
    console.error('[Cash Alert] Failed to send email:', error)
  }
}

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

  // Idempotent per-username seeding so cashier1..5 + admin always exist
  // on the Railway database (the web/Netlify build talks to this server).
  const SEED = [
    { username: 'admin',    display_name: 'Administrator', pin: '9012', role: 'admin'   as const, resetPin: true },
    { username: 'cashier1', display_name: 'Cashier 1',     pin: '1111', role: 'cashier' as const, resetPin: true },
    { username: 'cashier2', display_name: 'Cashier 2',     pin: '2222', role: 'cashier' as const, resetPin: true },
    { username: 'cashier3', display_name: 'Cashier 3',     pin: '3333', role: 'cashier' as const, resetPin: true },
    { username: 'cashier4', display_name: 'Cashier 4',     pin: '4444', role: 'cashier' as const, resetPin: true },
    { username: 'cashier5', display_name: 'Cashier 5',     pin: '5555', role: 'cashier' as const, resetPin: true }
  ]
  for (const u of SEED) {
    const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE username = $1', [u.username])
    const pinHash = bcrypt.hashSync(u.pin, 10)
    if (!existing) {
      await db.run(
        'INSERT INTO users (id, username, display_name, pin_hash, role, active) VALUES ($1,$2,$3,$4,$5,1)',
        [uuid(), u.username, u.display_name, pinHash, u.role]
      )
    } else if (u.resetPin) {
      // Reset PIN + display_name so server matches the install's known credentials.
      await db.run(
        'UPDATE users SET display_name = $1, pin_hash = $2, role = $3, active = 1, failed_attempts = 0, locked_until = NULL WHERE id = $4',
        [u.display_name, pinHash, u.role, existing.id]
      )
    }
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
    'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.image_url || null]
  )
  const product = await db.queryOne('SELECT * FROM products WHERE id = $1', [id])
  res.json(product)
})

app.put('/api/products/:id', async (req, res) => {
  const p = req.body
  await db.run(
    'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, image_url=$11, updated_at=NOW() WHERE id=$12',
    [p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.image_url || null, req.params.id]
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

  await sendCashDrawerAlertIfNeeded(input.shift_id)
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

  // Per-cashier breakdown — prefer the human name typed at shift open.
  const byCashier = await db.query<any>(`
    SELECT s.user_id, u.username, u.display_name,
      MAX(sh.cashier_name) as shift_cashier_name,
      COUNT(s.id) as sales_count, COALESCE(SUM(s.total),0) as revenue
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shifts sh ON sh.id = s.shift_id
    WHERE s.created_at::date = $1 AND s.status = 'completed'
    GROUP BY s.user_id, u.username, u.display_name
    ORDER BY revenue DESC
  `, [date])

  const byTerminal = await db.query<any>(`
    SELECT COALESCE(terminal_id, 'unknown') as terminal_id,
      COUNT(id) as sales_count, COALESCE(SUM(total),0) as revenue
    FROM sales
    WHERE created_at::date = $1 AND status = 'completed'
    GROUP BY terminal_id
    ORDER BY revenue DESC
  `, [date])

  const transactions = await db.query<any>(`
    SELECT s.id, s.receipt_number, s.total, s.payment_method, s.terminal_id, s.created_at,
      u.username, u.display_name, sh.cashier_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shifts sh ON sh.id = s.shift_id
    WHERE s.created_at::date = $1 AND s.status = 'completed'
    ORDER BY s.created_at DESC
  `, [date])

  res.json({
    total_sales: totalSales,
    total_revenue: totalRevenue,
    total_vat: Number(summary?.total_vat) || 0,
    items_sold: Number(itemsRow?.items_sold) || 0,
    cash_sales: Number(summary?.cash_sales) || 0,
    mobile_sales: Number(summary?.mobile_sales) || 0,
    average_sale: totalSales > 0 ? totalRevenue / totalSales : 0,
    by_cashier: byCashier.map((r: any) => ({
      user_id: r.user_id,
      username: r.username || '—',
      display_name: r.display_name || r.username || '—',
      shift_cashier_name: r.shift_cashier_name || null,
      sales_count: Number(r.sales_count) || 0,
      revenue: Number(r.revenue) || 0
    })),
    by_terminal: byTerminal.map((r: any) => ({
      terminal_id: r.terminal_id,
      sales_count: Number(r.sales_count) || 0,
      revenue: Number(r.revenue) || 0
    })),
    transactions: transactions.map((r: any) => ({
      id: r.id,
      receipt_number: r.receipt_number,
      total: Number(r.total) || 0,
      payment_method: r.payment_method,
      terminal_id: r.terminal_id,
      created_at: r.created_at,
      username: r.username,
      display_name: r.display_name,
      shift_cashier_name: r.cashier_name
    }))
  })
})

// --- Sales Export (Excel) ---
app.get('/api/sales/export', async (req, res) => {
  const date = req.query.date as string
  if (!date) return res.status(400).json({ error: 'date query parameter required' })

  const sales = await db.query<any>(`
    SELECT s.receipt_number, s.created_at, u.display_name as cashier,
      sh.cashier_name as shift_cashier_name, s.terminal_id,
      s.payment_method, s.subtotal, s.vat_total, s.total,
      s.amount_tendered, s.change_given, s.mobile_ref, s.status
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN shifts sh ON sh.id = s.shift_id
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
  ws.mergeCells('A1:J1')
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

  const headerRow = ws.addRow(['Receipt #', 'Time', 'Cashier', 'Person on shift', 'Terminal', 'Payment', 'Subtotal', 'VAT', 'Total', 'Status'])
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
      sale.shift_cashier_name || '',
      sale.terminal_id ? String(sale.terminal_id).slice(0, 8) : '',
      sale.payment_method === 'mobile_money' ? 'Mobile Money' : 'Cash',
      Number(sale.subtotal), Number(sale.vat_total), Number(sale.total), sale.status
    ])
  }

  for (const col of [7, 8, 9]) ws.getColumn(col).numFmt = '#,##0.00'
  ws.getColumn(1).width = 18; ws.getColumn(2).width = 10; ws.getColumn(3).width = 16
  ws.getColumn(4).width = 20; ws.getColumn(5).width = 12; ws.getColumn(6).width = 14
  ws.getColumn(7).width = 12; ws.getColumn(8).width = 12; ws.getColumn(9).width = 12; ws.getColumn(10).width = 10

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
  const { userId, openingCash, cashierName } = req.body
  const settings = await getSettingsMap()
  const openingLimit = parseFloat(settings.opening_cash_limit || '1000') || 1000

  if (Number(openingCash) < 0) {
    return res.status(400).json({ error: 'Opening cash cannot be negative' })
  }
  if (Number(openingCash) > openingLimit) {
    return res.status(400).json({ error: `Opening cash cannot be more than K ${openingLimit.toFixed(2)}` })
  }

  const id = uuid()
  const name = (cashierName || '').trim() || null
  await db.run('INSERT INTO shifts (id, user_id, cashier_name, opening_cash, status) VALUES ($1,$2,$3,$4,$5)', [id, userId, name, openingCash, 'open'])
  const shift = await getShiftWithCashStats(id)
  res.json(shift)
})

app.post('/api/shifts/close', async (req, res) => {
  const { shiftId, closingCash, notes } = req.body
  const shift = await db.queryOne<any>('SELECT * FROM shifts WHERE id = $1', [shiftId])
  if (!shift) return res.json(null)
  const cashSales = await getCashSalesForShift(shiftId)
  const expectedCash = Number(shift.opening_cash) + cashSales
  const variance = closingCash - expectedCash
  await db.run("UPDATE shifts SET closing_cash=$1, expected_cash=$2, variance=$3, notes=$4, status='closed', closed_at=NOW() WHERE id=$5",
    [closingCash, expectedCash, variance, notes, shiftId])
  const updated = await getShiftWithCashStats(shiftId)
  res.json(updated)
})

app.get('/api/shifts/current/:userId', async (req, res) => {
  const shift = await getCurrentShiftForUser(req.params.userId)
  res.json(shift)
})

// --- Settings ---
app.get('/api/settings', async (_req, res) => {
  const settings = await getSettingsMap()
  res.json(settings)
})

app.put('/api/settings/:key', async (req, res) => {
  await upsertSetting(req.params.key, req.body.value)
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
          payment_method, amount_tendered, change_given, mobile_ref, status, terminal_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [sale.id, receiptNumber, sale.user_id, sale.shift_id, sale.subtotal,
         sale.vat_total, sale.total, sale.payment_method, sale.amount_tendered,
         sale.change_given, sale.mobile_ref, sale.status, sale.terminal_id || null, sale.created_at]
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

    await sendCashDrawerAlertIfNeeded(sale.shift_id)
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
        'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, image_url=$11, updated_at=NOW() WHERE id=$12',
        [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, p.is_weighted ? 1 : 0, p.image_url || null, p.id]
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
            'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [p.id, '__sync_temp_' + p.id, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.image_url || null]
          )
          await db.run('UPDATE sale_items SET product_id = $1 WHERE product_id = $2', [p.id, existingByBarcode.id])
          await db.run('DELETE FROM products WHERE id = $1', [existingByBarcode.id])
          await db.run('UPDATE products SET barcode = $1 WHERE id = $2', [p.barcode, p.id])
        })
        return res.json({ status: 'synced' })
      }
    }

    await db.run(
      'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [p.id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.image_url || null]
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
      'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, image_url=$11, updated_at=NOW() WHERE id=$12',
      [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, p.is_weighted ? 1 : 0, p.image_url || null, req.params.id]
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
        `UPDATE shifts SET cashier_name=$1, opening_cash=$2, closing_cash=$3, expected_cash=$4, variance=$5,
         total_sales=$6, total_transactions=$7, total_vat=$8, status=$9, notes=$10, closed_at=$11 WHERE id=$12`,
        [s.cashier_name || null, s.opening_cash, s.closing_cash, s.expected_cash, s.variance, s.total_sales,
         s.total_transactions, s.total_vat, s.status, s.notes, s.closed_at, s.id]
      )
    } else {
      await db.run(
        `INSERT INTO shifts (id, user_id, cashier_name, opening_cash, closing_cash, expected_cash, variance,
         total_sales, total_transactions, total_vat, status, notes, opened_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [s.id, s.user_id, s.cashier_name || null, s.opening_cash, s.closing_cash, s.expected_cash, s.variance,
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
    await upsertSetting(key || req.params.key, value)
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

// --- Active cashier sessions (cross-terminal lock) ---
// In-memory: a cashier may only be signed in on one terminal at a time. TTL of
// 10 minutes refreshed by login/heartbeat; if a terminal crashes, the lock
// auto-clears in ~10 min.
interface ActiveSession { user_id: string; terminal_id: string; terminal_name: string; last_seen: number }
const activeSessions = new Map<string, ActiveSession>()
const SESSION_TTL_MS = 10 * 60 * 1000

function getActiveSession(userId: string): ActiveSession | null {
  const s = activeSessions.get(userId)
  if (!s) return null
  if (Date.now() - s.last_seen > SESSION_TTL_MS) { activeSessions.delete(userId); return null }
  return s
}

app.get('/api/sessions/active/:userId', (req, res) => {
  const s = getActiveSession(req.params.userId)
  if (!s) return res.json({ active: false })
  res.json({ active: true, terminal_id: s.terminal_id, terminal_name: s.terminal_name })
})

app.post('/api/sessions/login', (req, res) => {
  const { user_id, terminal_id, terminal_name } = req.body || {}
  if (!user_id || !terminal_id) return res.status(400).json({ error: 'user_id and terminal_id required' })
  const existing = getActiveSession(user_id)
  if (existing && existing.terminal_id !== terminal_id) {
    return res.status(409).json({
      error: 'User already signed in on another terminal',
      terminal_id: existing.terminal_id,
      terminal_name: existing.terminal_name
    })
  }
  activeSessions.set(user_id, { user_id, terminal_id, terminal_name: terminal_name || 'Terminal', last_seen: Date.now() })
  res.json({ ok: true })
})

app.post('/api/sessions/heartbeat', (req, res) => {
  const { user_id, terminal_id } = req.body || {}
  const existing = getActiveSession(user_id)
  if (!existing || existing.terminal_id !== terminal_id) return res.status(404).json({ error: 'No active session' })
  existing.last_seen = Date.now()
  res.json({ ok: true })
})

app.post('/api/sessions/logout', (req, res) => {
  const { user_id, terminal_id } = req.body || {}
  const existing = getActiveSession(user_id)
  if (existing && existing.terminal_id === terminal_id) activeSessions.delete(user_id)
  res.json({ ok: true })
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
