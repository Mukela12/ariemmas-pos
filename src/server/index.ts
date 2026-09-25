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
import { barcodeCandidates } from '../shared/barcode'

const app = express()
app.use(cors())
// 5mb so product image data-URLs (and admin image uploads) fit in the body
app.use(express.json({ limit: '5mb' }))

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

// Make sure a user row exists for the given id so a sale/shift FK resolves. With
// multiple tills sharing usernames, one till's user-sync can delete another's
// user id — we must never drop a sale/shift over that. A placeholder is created
// if needed; the real cashier still shows in reports via the shift's cashier name.
async function ensureUserRow(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  const exists = await db.queryOne('SELECT id FROM users WHERE id = $1', [userId])
  if (exists) return
  await db.run(
    `INSERT INTO users (id, username, display_name, pin_hash, role, active)
     VALUES ($1, $2, 'Cashier (synced)', '!', 'cashier', 1) ON CONFLICT (id) DO NOTHING`,
    [userId, 'sync_' + String(userId).replace(/[^A-Za-z0-9]/g, '')]
  ).catch(() => { /* concurrent insert / race — fine */ })
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

// Run migrations without ever blocking or crashing the boot. A pending DDL
// migration (e.g. ADD COLUMN) can fail to acquire its lock while the previous
// deploy is still serving during Railway's zero-downtime overlap. Rather than
// hang forever (or exit and crash-loop), we start serving anyway and retry in
// the background — once this container is healthy Railway stops the old one, the
// lock clears, and the retry applies the migration.
let migrationsDone = false
async function applyMigrationsResilient(): Promise<void> {
  try {
    await runMigrations(db)
    migrationsDone = true
    console.log('[Migrations] up to date')
  } catch (err: any) {
    console.error('[Migrations] deferred — serving now, retrying in background:', err?.message || err)
    let attempts = 0
    const retry = async (): Promise<void> => {
      attempts++
      try {
        await runMigrations(db)
        migrationsDone = true
        console.log(`[Migrations] applied on retry #${attempts}`)
      } catch (e: any) {
        if (attempts < 120) {
          setTimeout(() => { void retry() }, 5000) // ~10 min of 5s retries
        } else {
          console.error('[Migrations] giving up after', attempts, 'retries:', e?.message || e)
        }
      }
    }
    setTimeout(() => { void retry() }, 5000)
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

  await applyMigrationsResilient()

  // Idempotent per-username seeding so cashier1..5 + admin always exist
  // on the Railway database (the web/Netlify build talks to this server).
  // Two admins (one is the owner's aunt, Mary) + five cashiers with non-obvious
  // PINs. Kept in sync with the desktop seed (src/main/services/auth.ts).
  const SEED = [
    { username: 'admin',    display_name: 'Administrator', pin: '9012', role: 'admin'   as const, resetPin: true },
    { username: 'mary',     display_name: 'Mary',          pin: '4815', role: 'admin'   as const, resetPin: true },
    { username: 'cashier1', display_name: 'Cashier 1',     pin: '3174', role: 'cashier' as const, resetPin: true },
    { username: 'cashier2', display_name: 'Cashier 2',     pin: '5926', role: 'cashier' as const, resetPin: true },
    { username: 'cashier3', display_name: 'Cashier 3',     pin: '8043', role: 'cashier' as const, resetPin: true },
    { username: 'cashier4', display_name: 'Cashier 4',     pin: '2687', role: 'cashier' as const, resetPin: true },
    { username: 'cashier5', display_name: 'Cashier 5',     pin: '6351', role: 'cashier' as const, resetPin: true }
  ]
  // Version-gated: apply the credential set once (so existing rows get the new
  // PINs), then leave logins alone on later restarts so admin PIN changes (from
  // the desktop Cashiers screen, synced here) survive. Bump CRED_SEED_VERSION to
  // force a one-time reset back to SEED.
  const CRED_SEED_VERSION = '1'
  const verRow = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'cred_seed_version'")
  const forceReset = (verRow?.value ?? '0') !== CRED_SEED_VERSION
  for (const u of SEED) {
    const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE username = $1', [u.username])
    const pinHash = bcrypt.hashSync(u.pin, 10)
    if (!existing) {
      await db.run(
        'INSERT INTO users (id, username, display_name, pin_hash, pin_plain, role, active) VALUES ($1,$2,$3,$4,$5,$6,1)',
        [uuid(), u.username, u.display_name, pinHash, u.pin, u.role]
      )
    } else if (forceReset) {
      await db.run(
        'UPDATE users SET display_name = $1, pin_hash = $2, pin_plain = $3, role = $4, active = 1, failed_attempts = 0, locked_until = NULL WHERE id = $5',
        [u.display_name, pinHash, u.pin, u.role, existing.id]
      )
    }
  }
  if (forceReset) {
    if (verRow) await db.run("UPDATE settings SET value = $1 WHERE key = 'cred_seed_version'", [CRED_SEED_VERSION])
    else await db.run("INSERT INTO settings (key, value) VALUES ('cred_seed_version', $1)", [CRED_SEED_VERSION])
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

// --- Admin cashier management (web) ---
// Every endpoint re-verifies the caller's admin PIN, so cashier PINs are never
// readable or changeable over the public API without valid admin credentials.
async function verifyAdminCreds(username: string, pin: string): Promise<boolean> {
  if (!username || !pin) return false
  const u = await db.queryOne<any>('SELECT * FROM users WHERE username = $1 AND active = 1', [username])
  if (!u || (u.role !== 'admin' && u.role !== 'manager')) return false
  return bcrypt.compareSync(pin, u.pin_hash)
}

app.post('/api/admin/users', async (req, res) => {
  const { username, pin } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  const rows = await db.query<any>('SELECT id, username, display_name, pin_plain, role FROM users WHERE active = 1 ORDER BY role DESC, username')
  res.json(rows.map((r) => ({ id: r.id, username: r.username, display_name: r.display_name, pin: r.pin_plain, role: r.role })))
})

app.post('/api/admin/users/setpin', async (req, res) => {
  const { username, pin, targetId, newPin } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  if (!/^\d{4,6}$/.test(newPin || '')) return res.json({ ok: false, error: 'PIN must be 4 to 6 digits.' })
  const hash = bcrypt.hashSync(newPin, 10)
  await db.run('UPDATE users SET pin_hash = $1, pin_plain = $2, failed_attempts = 0, locked_until = NULL WHERE id = $3', [hash, newPin, targetId])
  res.json({ ok: true })
})

app.post('/api/admin/users/create', async (req, res) => {
  const { username, pin, newUsername, displayName, newPin } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  const uname = String(newUsername || '').trim().toLowerCase()
  if (!/^[a-z0-9]{3,20}$/.test(uname)) return res.json({ ok: false, error: 'Username must be 3–20 letters/numbers.' })
  if (!String(displayName || '').trim()) return res.json({ ok: false, error: 'Name cannot be empty.' })
  if (!/^\d{4,6}$/.test(newPin || '')) return res.json({ ok: false, error: 'PIN must be 4 to 6 digits.' })
  if (await db.queryOne('SELECT id FROM users WHERE username = $1', [uname])) return res.json({ ok: false, error: 'That username is already taken.' })
  const hash = bcrypt.hashSync(newPin, 10)
  await db.run("INSERT INTO users (id, username, display_name, pin_hash, pin_plain, role, active) VALUES ($1,$2,$3,$4,$5,'cashier',1)", [uuid(), uname, String(displayName).trim(), hash, newPin])
  res.json({ ok: true })
})

app.post('/api/admin/users/rename', async (req, res) => {
  const { username, pin, targetId, displayName } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  if (!String(displayName || '').trim()) return res.json({ ok: false, error: 'Name cannot be empty.' })
  await db.run('UPDATE users SET display_name = $1 WHERE id = $2', [String(displayName).trim(), targetId])
  res.json({ ok: true })
})

// --- Refunds (web) — admin/manager gated; mirrors the desktop till flow. ---
const round2 = (n: number): number => Math.round(n * 100) / 100

app.post('/api/refunds/lookup', async (req, res) => {
  const { username, pin, receipt } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  try {
    const q = String(receipt || '').trim()
    const sale = await db.queryOne<any>('SELECT * FROM sales WHERE receipt_number = $1 OR id = $1', [q])
    if (!sale) return res.json(null)
    const items = await db.query<any>('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id])
    const refunds = await db.query<any>('SELECT * FROM refunds WHERE sale_id = $1 ORDER BY created_at', [sale.id])
    const refunded = await db.query<any>(
      `SELECT ri.sale_item_id, SUM(ri.quantity) as qty
       FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
       WHERE r.sale_id = $1 GROUP BY ri.sale_item_id`, [sale.id])
    const refundedBy = new Map(refunded.map((r: any) => [r.sale_item_id, Number(r.qty) || 0]))
    res.json({
      sale,
      items: items.map((it: any) => ({ ...it, refunded_quantity: refundedBy.get(it.id) || 0 })),
      refunds
    })
  } catch (err: any) {
    console.error('[Refunds] lookup error:', err.message)
    res.status(500).json({ error: 'Could not load the sale.' })
  }
})

app.post('/api/refunds', async (req, res) => {
  const { username, pin, input } = req.body || {}
  if (!(await verifyAdminCreds(username, pin))) return res.status(403).json({ error: 'Admin authentication failed.' })
  try {
    const admin = await db.queryOne<any>('SELECT id FROM users WHERE username = $1 AND active = 1', [username])
    const sale = await db.queryOne<any>('SELECT * FROM sales WHERE id = $1', [input?.sale_id])
    if (!sale) return res.status(404).json({ error: 'Sale not found' })

    const saleItems = await db.query<any>('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id])
    const byId = new Map(saleItems.map((s: any) => [s.id, s]))
    const refunded = await db.query<any>(
      `SELECT ri.sale_item_id, SUM(ri.quantity) as qty
       FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
       WHERE r.sale_id = $1 GROUP BY ri.sale_item_id`, [sale.id])
    const refundedBy = new Map(refunded.map((r: any) => [r.sale_item_id, Number(r.qty) || 0]))

    const lines: any[] = []
    let total = 0
    let vatTotal = 0
    for (const reqItem of input?.items || []) {
      const qty = Math.round(Number(reqItem.quantity) * 1000) / 1000
      if (!Number.isFinite(qty) || qty <= 0) continue
      const orig = byId.get(reqItem.sale_item_id)
      if (!orig) return res.status(400).json({ error: 'Selected item is not on this sale' })
      const remaining = Number(orig.quantity) - (refundedBy.get(orig.id) || 0)
      if (qty > remaining + 1e-9) {
        return res.status(400).json({ error: `Only ${remaining} of ${orig.product_name} can still be refunded` })
      }
      lines.push({
        id: uuid(), sale_item_id: orig.id, product_id: orig.product_id,
        product_name: orig.product_name, quantity: qty,
        unit_price: Number(orig.unit_price),
        vat_amount: round2(Number(orig.vat_amount) * (qty / Number(orig.quantity))),
        line_total: round2(Number(orig.unit_price) * qty)
      })
      total = round2(total + round2(Number(orig.unit_price) * qty))
      vatTotal = round2(vatTotal + round2(Number(orig.vat_amount) * (qty / Number(orig.quantity))))
    }
    if (lines.length === 0) return res.status(400).json({ error: 'Nothing selected to refund' })

    const prior = await db.queryOne<any>('SELECT COUNT(*) as c FROM refunds WHERE sale_id = $1', [sale.id])
    const refundNumber = `R${(Number(prior?.c) || 0) + 1}-${sale.receipt_number}`
    const refundId = uuid()

    await db.run(
      `INSERT INTO refunds (id, sale_id, refund_number, user_id, reason, total, vat_total, restocked, terminal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'web')`,
      [refundId, sale.id, refundNumber, admin?.id || null, String(input?.reason || '').trim() || null,
       total, vatTotal, input?.restock ? 1 : 0])

    for (const l of lines) {
      await db.run(
        `INSERT INTO refund_items (id, refund_id, sale_item_id, product_id, product_name, quantity, unit_price, vat_amount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [l.id, refundId, l.sale_item_id, l.product_id, l.product_name, l.quantity, l.unit_price, l.vat_amount, l.line_total])
      if (input?.restock && l.product_id) {
        await db.run('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [l.quantity, l.product_id])
        const af = await db.queryOne<any>('SELECT stock_quantity FROM products WHERE id = $1', [l.product_id])
        await db.run(
          'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [uuid(), l.product_id, 'refund', l.quantity, Number(af?.stock_quantity ?? 0), `Refund ${refundNumber}`, admin?.id || null, 'web'])
      }
    }

    await db.run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [uuid(), admin?.id || null, 'refund', 'refund', refundId,
       JSON.stringify({ sale_id: sale.id, receipt: sale.receipt_number, refund_number: refundNumber, total, items: lines.length, restocked: !!input?.restock, via: 'web' })])

    const refund = await db.queryOne('SELECT * FROM refunds WHERE id = $1', [refundId])
    res.json(refund)
  } catch (err: any) {
    console.error('[Refunds] create error:', err.message)
    res.status(500).json({ error: 'Refund failed.' })
  }
})

// ============================================================================
// Data export API (owner/admin only).
// Lets Mary pull raw data straight from the database for her own analytics —
// all history or filtered by date. Protected by the SAME admin credentials as
// the rest of the platform (verifyAdminCreds: admin/manager role + bcrypt PIN),
// supplied via HTTP Basic Auth so it works directly from a browser, Excel/Power
// BI ("From Web"), or curl over HTTPS. Read-only (SELECT); cashiers/public are
// rejected with 401.
// ============================================================================
function parseBasicAuth(req: any): { username: string; pin: string } | null {
  const h = String(req.headers.authorization || '')
  if (!h.startsWith('Basic ')) return null
  try {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    if (i < 0) return null
    return { username: decoded.slice(0, i), pin: decoded.slice(i + 1) }
  } catch {
    return null
  }
}

function toCsv(rows: any[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: any): string => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.join(',')]
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','))
  return lines.join('\r\n')
}

// Optional date-range filter on a text timestamp column. $1 = from, $2 = to;
// an empty/null bound means "no limit on that side" (so omitting both = all history).
const dateWhere = (col: string): string =>
  `(COALESCE($1,'') = '' OR NULLIF(${col},'')::date >= $1::date) AND (COALESCE($2,'') = '' OR NULLIF(${col},'')::date <= $2::date)`

const EXPORT_QUERIES: Record<string, (from: string | null, to: string | null) => { sql: string; params: any[] }> = {
  sales: (from, to) => ({
    sql: `SELECT s.id AS sale_id, s.receipt_number, s.terminal_id, u.display_name AS "user",
            sh.cashier_name AS cashier, s.created_at, s.payment_method,
            s.subtotal, s.vat_total, s.total, s.amount_tendered, s.change_given, s.mobile_ref, s.status
          FROM sales s
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN shifts sh ON sh.id = s.shift_id
          WHERE ${dateWhere('s.created_at')}
          ORDER BY s.created_at`,
    params: [from, to]
  }),
  'sale-items': (from, to) => ({
    sql: `SELECT si.id AS item_id, si.sale_id, s.receipt_number, s.terminal_id, s.created_at,
            si.product_name, si.barcode, si.quantity, si.unit_price, si.vat_rate, si.vat_amount, si.line_total
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE ${dateWhere('s.created_at')}
          ORDER BY s.created_at`,
    params: [from, to]
  }),
  products: () => ({
    sql: `SELECT p.id, p.barcode, p.name, c.name AS category, p.price, p.cost_price, p.vat_rate,
            p.stock_quantity, p.min_stock_level, p.unit, p.is_weighted, p.scale_plu, p.active, p.updated_at
          FROM products p LEFT JOIN categories c ON c.id = p.category_id
          ORDER BY p.name`,
    params: []
  }),
  shifts: (from, to) => ({
    sql: `SELECT sh.id AS shift_id, u.display_name AS "user", sh.cashier_name, sh.opened_at, sh.closed_at,
            sh.opening_cash, sh.closing_cash, sh.expected_cash, sh.variance,
            sh.total_sales, sh.total_transactions, sh.total_vat, sh.status, sh.notes
          FROM shifts sh LEFT JOIN users u ON u.id = sh.user_id
          WHERE ${dateWhere('sh.opened_at')}
          ORDER BY sh.opened_at`,
    params: [from, to]
  }),
  // refunds.created_at is a real timestamptz (not text like the older tables),
  // so it casts to ::date directly without the NULLIF dance.
  refunds: (from, to) => ({
    sql: `SELECT r.id AS refund_id, r.refund_number, s.receipt_number AS sale_receipt, r.terminal_id,
            u.display_name AS processed_by, r.created_at, r.reason, r.restocked, r.vat_total, r.total
          FROM refunds r
          LEFT JOIN sales s ON s.id = r.sale_id
          LEFT JOIN users u ON u.id = r.user_id
          WHERE (COALESCE($1,'') = '' OR r.created_at::date >= $1::date)
            AND (COALESCE($2,'') = '' OR r.created_at::date <= $2::date)
          ORDER BY r.created_at`,
    params: [from, to]
  }),
  'refund-items': (from, to) => ({
    sql: `SELECT ri.id AS item_id, r.refund_number, r.created_at,
            ri.product_name, ri.quantity, ri.unit_price, ri.vat_amount, ri.line_total
          FROM refund_items ri
          JOIN refunds r ON r.id = ri.refund_id
          WHERE (COALESCE($1,'') = '' OR r.created_at::date >= $1::date)
            AND (COALESCE($2,'') = '' OR r.created_at::date <= $2::date)
          ORDER BY r.created_at`,
    params: [from, to]
  }),
  'stock-movements': (from, to) => ({
    sql: `SELECT sm.id, sm.created_at, p.name AS product, sm.type, sm.quantity_change, sm.balance_after,
            sm.reason, sm.terminal_id
          FROM stock_movements sm LEFT JOIN products p ON p.id = sm.product_id
          WHERE ${dateWhere('sm.created_at')}
          ORDER BY sm.created_at`,
    params: [from, to]
  })
}

function requireExportAuth(req: any, res: any): Promise<boolean> {
  const creds = parseBasicAuth(req)
  return (creds ? verifyAdminCreds(creds.username, creds.pin) : Promise.resolve(false)).then((ok) => {
    if (!ok) {
      res.set('WWW-Authenticate', 'Basic realm="Ariemmas Data Export"')
      res.status(401).json({ error: 'Admin login required. Use your Mary / admin username and PIN.' })
    }
    return ok
  })
}

// Index — lists the datasets + usage (also auth-protected so nothing leaks).
app.get('/api/export', async (req, res) => {
  if (!(await requireExportAuth(req, res))) return
  res.json({
    datasets: Object.keys(EXPORT_QUERIES),
    usage: '/api/export/{dataset}?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json  — dates optional (omit for all history); format defaults to csv',
    examples: [
      '/api/export/sales',
      '/api/export/sales?from=2026-07-01&to=2026-07-31',
      '/api/export/sales?from=2026-01-01&to=2026-12-31&format=json',
      '/api/export/sale-items?from=2026-07-01',
      '/api/export/products'
    ]
  })
})

app.get('/api/export/:dataset', async (req, res) => {
  if (!(await requireExportAuth(req, res))) return
  const builder = EXPORT_QUERIES[req.params.dataset]
  if (!builder) {
    return res.status(404).json({ error: `Unknown dataset "${req.params.dataset}". Available: ${Object.keys(EXPORT_QUERIES).join(', ')}` })
  }
  const from = (req.query.from as string) || null
  const to = (req.query.to as string) || null
  try {
    const { sql, params } = builder(from, to)
    const rows = await db.query<any>(sql, params)
    if (String(req.query.format || 'csv').toLowerCase() === 'json') {
      return res.json({ dataset: req.params.dataset, from, to, count: rows.length, rows })
    }
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="ariemmas-${req.params.dataset}-${from || 'all'}-to-${to || 'all'}.csv"`)
    res.send(toCsv(rows))
  } catch (err: any) {
    console.error('[Export] error:', err.message)
    res.status(500).json({ error: err.message })
  }
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

// Try the scanned code and its UPC-A/EAN-13 leading-zero equivalents, so a
// product saved with 12 digits still matches a scanner that transmits 13.
app.get('/api/products/barcode/:barcode', async (req, res) => {
  for (const candidate of barcodeCandidates(req.params.barcode)) {
    const product = await db.queryOne('SELECT * FROM products WHERE barcode = $1 AND active = 1', [candidate])
    if (product) return res.json(product)
  }
  res.json(null)
})

// Look up a product by its scale PLU (scanned label-printing-scale barcode).
app.get('/api/products/plu/:plu', async (req, res) => {
  const product = await db.queryOne('SELECT * FROM products WHERE scale_plu = $1 AND active = 1', [parseInt(req.params.plu, 10)])
  res.json(product)
})

// Catalog pull for offline terminals: products (incl. deactivated, so deletes
// propagate) + categories + the shared settings, changed since `since`. The
// terminal sends back the serverTime it last received, so deltas are immune to
// clock skew. Terminal-local settings (printer, terminal id) are never shared.
const SHARED_SETTING_KEYS = [
  'shop_name', 'shop_address', 'shop_phone', 'shop_tpin',
  'receipt_header', 'receipt_footer', 'vat_enabled', 'vat_rate',
  'opening_cash_limit', 'cash_alert_threshold', 'cash_alert_email'
]
app.get('/api/sync/catalog', async (req, res) => {
  try {
    const since = (req.query.since as string) || ''
    const serverTime = new Date().toISOString()
    // updated_at is stored as text, so compare as timestamps (the space-vs-T
    // separator would otherwise make a plain string comparison always false).
    const products = since
      ? await db.query("SELECT * FROM products WHERE NULLIF(updated_at,'')::timestamptz > $1::timestamptz ORDER BY updated_at", [since])
      : await db.query('SELECT * FROM products ORDER BY updated_at')
    const categories = await db.query('SELECT * FROM categories')
    const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const r of rows) if (SHARED_SETTING_KEYS.includes(r.key)) settings[r.key] = r.value
    res.json({ serverTime, products, categories, settings })
  } catch (err: any) {
    console.error('[Sync] Catalog pull error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// --- Inventory management ---
// Set a product's stock to an absolute count and log the movement (web admin).
app.post('/api/products/:id/adjust', async (req, res) => {
  try {
    const { newQuantity, reason, type, user_id } = req.body || {}
    const product = await db.queryOne<any>('SELECT * FROM products WHERE id = $1', [req.params.id])
    if (!product) return res.status(404).json({ ok: false, error: 'Product not found.' })
    const target = Number(newQuantity)
    if (!Number.isFinite(target) || target < 0) return res.json({ ok: false, error: 'Enter a valid stock quantity (0 or more).' })
    const change = target - (Number(product.stock_quantity) || 0)
    await db.run('UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2', [target, req.params.id])
    await db.run(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uuid(), req.params.id, type || 'adjustment', change, target, reason || null, user_id || null]
    )
    const updated = await db.queryOne('SELECT * FROM products WHERE id = $1', [req.params.id])
    res.json({ ok: true, product: updated })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Movement sync from a terminal (a desktop adjustment).
app.post('/api/sync/stock-movements', async (req, res) => {
  try {
    const m = req.body
    if (!m?.id) return res.status(400).json({ error: 'Missing movement' })
    const ex = await db.queryOne('SELECT id FROM stock_movements WHERE id = $1', [m.id])
    if (ex) return res.json({ status: 'already_synced' })
    await db.run(
      'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [m.id, m.product_id, m.type, m.quantity_change, m.balance_after, m.reason || null, m.user_id || null, m.terminal_id || null]
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/products/:id/movements', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100
  const rows = await db.query(
    'SELECT m.*, p.name as product_name FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id WHERE m.product_id = $1 ORDER BY m.created_at DESC LIMIT $2',
    [req.params.id, limit]
  )
  res.json(rows)
})

app.get('/api/inventory/summary', async (_req, res) => {
  const row = await db.queryOne<any>(`
    SELECT COUNT(*) as items, COALESCE(SUM(stock_quantity),0) as units,
      COALESCE(SUM(CASE WHEN stock_quantity <= min_stock_level AND stock_quantity > 0 THEN 1 ELSE 0 END),0) as low,
      COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END),0) as out,
      COALESCE(SUM(stock_quantity * cost_price),0) as value
    FROM products WHERE active = 1`)
  res.json({
    items: Number(row?.items) || 0, units: Number(row?.units) || 0,
    lowStock: Number(row?.low) || 0, outOfStock: Number(row?.out) || 0, stockValue: Number(row?.value) || 0
  })
})

app.post('/api/products', async (req, res) => {
  const p = req.body
  const id = uuid()
  await db.run(
    'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, scale_plu, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url || null]
  )
  const product = await db.queryOne('SELECT * FROM products WHERE id = $1', [id])
  res.json(product)
})

app.put('/api/products/:id', async (req, res) => {
  const p = req.body
  // COALESCE keeps the existing image_url when the caller doesn't send one
  // (e.g. editing price/stock shouldn't wipe the product image).
  await db.run(
    'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, scale_plu=$11, image_url=COALESCE($12, image_url), updated_at=NOW() WHERE id=$13',
    [p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url ?? null, req.params.id]
  )
  const product = await db.queryOne('SELECT * FROM products WHERE id = $1', [req.params.id])
  res.json(product)
})

app.delete('/api/products/:id', async (req, res) => {
  // Soft delete so sale history stays intact; the row drops out of all lists.
  await db.run('UPDATE products SET active = 0, updated_at = NOW() WHERE id = $1', [req.params.id])
  res.json({ ok: true })
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
      const af = await db.queryOne<any>('SELECT stock_quantity FROM products WHERE id = $1', [item.product_id])
      await db.run(
        'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [uuid(), item.product_id, 'sale', -item.quantity, Number(af?.stock_quantity ?? 0), 'Sale (web)', input.user_id || null]
      )
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

// Range summary for the web admin: revenue/sales/refunds between two dates
// (inclusive), a per-day breakdown for bars, and how long sales tracking has
// been running (first sale ever + lifetime totals).
app.get('/api/sales/range', async (req, res) => {
  try {
    const from = String(req.query.from || '')
    const to = String(req.query.to || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' })
    }

    const summary = await db.queryOne<any>(`
      SELECT COUNT(*) as total_sales, COALESCE(SUM(total),0) as total_revenue, COALESCE(SUM(vat_total),0) as total_vat,
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method='mobile_money' THEN total ELSE 0 END),0) as mobile_sales
      FROM sales WHERE created_at::date >= $1::date AND created_at::date <= $2::date AND status = 'completed'
    `, [from, to])

    const itemsRow = await db.queryOne<any>(`
      SELECT COALESCE(SUM(si.quantity),0) as items_sold FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at::date >= $1::date AND s.created_at::date <= $2::date AND s.status = 'completed'
    `, [from, to])

    const refundRow = await db.queryOne<any>(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM refunds
      WHERE created_at::date >= $1::date AND created_at::date <= $2::date
    `, [from, to]).catch(() => null)

    const daily = await db.query<any>(`
      SELECT created_at::date as day, COUNT(*) as sales_count, COALESCE(SUM(total),0) as revenue
      FROM sales WHERE created_at::date >= $1::date AND created_at::date <= $2::date AND status = 'completed'
      GROUP BY created_at::date ORDER BY day
    `, [from, to])

    const tracking = await db.queryOne<any>(`
      SELECT MIN(created_at)::date as first_sale_date, COUNT(*) as lifetime_sales,
        COALESCE(SUM(total),0) as lifetime_revenue
      FROM sales WHERE status = 'completed'
    `)

    const totalSales = Number(summary?.total_sales) || 0
    const totalRevenue = Number(summary?.total_revenue) || 0
    const refundTotal = Number(refundRow?.total) || 0
    res.json({
      from, to,
      total_sales: totalSales,
      total_revenue: totalRevenue,
      total_vat: Number(summary?.total_vat) || 0,
      items_sold: Number(itemsRow?.items_sold) || 0,
      cash_sales: Number(summary?.cash_sales) || 0,
      mobile_sales: Number(summary?.mobile_sales) || 0,
      refund_count: Number(refundRow?.cnt) || 0,
      refund_total: refundTotal,
      net_revenue: totalRevenue - refundTotal,
      average_sale: totalSales > 0 ? totalRevenue / totalSales : 0,
      daily: daily.map((d: any) => ({
        date: String(d.day).slice(0, 10),
        sales_count: Number(d.sales_count) || 0,
        revenue: Number(d.revenue) || 0
      })),
      tracking: {
        first_sale_date: tracking?.first_sale_date ? String(tracking.first_sale_date).slice(0, 10) : null,
        lifetime_sales: Number(tracking?.lifetime_sales) || 0,
        lifetime_revenue: Number(tracking?.lifetime_revenue) || 0
      }
    })
  } catch (err: any) {
    console.error('[Reports] range error:', err.message)
    res.status(500).json({ error: 'Could not load the range report.' })
  }
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

  // Refunds paid out that day (synced up from the tills).
  const refundSummary = await db.queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM refunds WHERE created_at::date = $1`,
    [date]
  ).catch(() => null)

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
    refund_count: Number(refundSummary?.cnt) || 0,
    refund_total: Number(refundSummary?.total) || 0,
    net_revenue: totalRevenue - (Number(refundSummary?.total) || 0),
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

// Sync a refund (idempotent by refund id). Stock is incremented ONLY when this
// call actually inserts the refund row — a re-sent refund (client retry racing
// a slow first request) must not restock twice, so the insert uses
// ON CONFLICT DO NOTHING RETURNING and the restock is gated on that result.
app.post('/api/sync/refunds', async (req, res) => {
  try {
    const { refund, items } = req.body || {}
    if (!refund?.id) return res.status(400).json({ error: 'Missing refund data' })

    await db.run(
      `INSERT INTO refunds (id, sale_id, refund_number, user_id, shift_id, reason, total, vat_total, restocked, terminal_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, NOW()))
       ON CONFLICT (id) DO NOTHING`,
      [refund.id, refund.sale_id, refund.refund_number, refund.user_id || null, refund.shift_id || null,
       refund.reason || null, refund.total, refund.vat_total || 0, refund.restocked ? 1 : 0,
       refund.terminal_id || null, refund.created_at || null]
    )

    // Always walk the items (a retry after a partial first attempt must fill in
    // the missing ones); restock only when THIS call inserted the item row.
    for (const item of items || []) {
      const itemInserted = await db.queryOne<{ id: string }>(
        `INSERT INTO refund_items (id, refund_id, sale_item_id, product_id, product_name, quantity, unit_price, vat_amount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [item.id, refund.id, item.sale_item_id || null, item.product_id || null, item.product_name,
         item.quantity, item.unit_price, item.vat_amount || 0, item.line_total]
      )
      if (itemInserted && refund.restocked && item.product_id) {
        await db.run('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
          [item.quantity, item.product_id])
        const af = await db.queryOne<any>('SELECT stock_quantity FROM products WHERE id = $1', [item.product_id])
        await db.run(
          'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [uuid(), item.product_id, 'refund', item.quantity, Number(af?.stock_quantity ?? 0),
           `Refund ${refund.refund_number || ''}`.trim(), refund.user_id || null, refund.terminal_id || null]
        )
      }
    }

    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] Refunds error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync a complete sale (idempotent — skips if sale ID already exists)
app.post('/api/sync/sales', async (req, res) => {
  try {
    const { sale, items } = req.body
    if (!sale?.id) return res.status(400).json({ error: 'Missing sale data' })

    const existing = await db.queryOne('SELECT id FROM sales WHERE id = $1', [sale.id])
    // NOTE: do NOT early-return when the sale already exists. We must still walk
    // the items below (each insert is idempotent), so any line that failed on an
    // earlier attempt — e.g. its product hadn't synced yet — gets filled in now.

    // Never drop a sale because its cashier's user row isn't on the cloud — with
    // several tills sharing usernames, one till's user-sync can delete another's
    // user id. Create a placeholder so the FK resolves; the real cashier still
    // shows in reports via the shift's cashier name.
    await ensureUserRow(sale.user_id)

    await db.transaction(async () => {
      if (!existing) {
        // Receipt numbers are per-till sequences, so several tills generate the
        // SAME number (20260623-0001...). Disambiguate a collision with a short
        // slice of the globally-unique sale id — a plain '-D' broke on the third
        // till's matching receipt (its '-D' clashed too) and 500'd the sale.
        let receiptNumber = sale.receipt_number
        const receiptExists = await db.queryOne('SELECT id FROM sales WHERE receipt_number = $1', [receiptNumber])
        if (receiptExists) {
          receiptNumber = `${receiptNumber}-${String(sale.id).replace(/-/g, '').slice(0, 6)}`
        }

        // ON CONFLICT keeps a re-sent sale idempotent. The sale id is a uuid, so a
        // clash is always the SAME sale (never a different one) — the old
        // non-atomic "if (!existing)" guard let a retry/race hit duplicate key
        // sales_pkey, return 500, and loop forever, clogging the whole queue.
        await db.run(
          `INSERT INTO sales (id, receipt_number, user_id, shift_id, subtotal, vat_total, total,
            payment_method, amount_tendered, change_given, mobile_ref, status, terminal_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
          [sale.id, receiptNumber, sale.user_id, sale.shift_id, sale.subtotal,
           sale.vat_total, sale.total, sale.payment_method, sale.amount_tendered,
           sale.change_given, sale.mobile_ref, sale.status, sale.terminal_id || null, sale.created_at]
        )
      }

      for (const item of items || []) {
        const itemExists = await db.queryOne('SELECT id FROM sale_items WHERE id = $1', [item.id])
        if (!itemExists) {
          // Resolve the product to a server id (a terminal that sold before its
          // first catalog pull may carry its own id) so the FK + stock land.
          let pid = item.product_id
          const exists = await db.queryOne('SELECT id FROM products WHERE id = $1', [pid])
          if (!exists && item.barcode) {
            const byBc = await db.queryOne<any>('SELECT id FROM products WHERE barcode = $1', [item.barcode])
            if (byBc) pid = byBc.id
          }
          await db.run(
            `INSERT INTO sale_items (id, sale_id, product_id, product_name, barcode,
              quantity, unit_price, vat_rate, vat_amount, line_total)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
            [item.id, item.sale_id, pid, item.product_name, item.barcode,
             item.quantity, item.unit_price, item.vat_rate, item.vat_amount, item.line_total]
          )
          await db.run('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, pid])
          const af = await db.queryOne<any>('SELECT stock_quantity FROM products WHERE id = $1', [pid])
          await db.run(
            'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [uuid(), pid, 'sale', -item.quantity, Number(af?.stock_quantity ?? 0), `Sale ${sale.receipt_number || ''}`.trim(), sale.user_id || null, sale.terminal_id || null]
          )
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
        'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, scale_plu=$11, image_url=$12, updated_at=NOW() WHERE id=$13',
        [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url || null, p.id]
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
            'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, scale_plu, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
            [p.id, '__sync_temp_' + p.id, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url || null]
          )
          await db.run('UPDATE sale_items SET product_id = $1 WHERE product_id = $2', [p.id, existingByBarcode.id])
          await db.run('DELETE FROM products WHERE id = $1', [existingByBarcode.id])
          await db.run('UPDATE products SET barcode = $1 WHERE id = $2', [p.barcode, p.id])
        })
        return res.json({ status: 'synced' })
      }
    }

    await db.run(
      'INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, scale_plu, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [p.id, p.barcode, p.name, p.category_id, p.price, p.cost_price || 0, p.vat_rate || 0.16, p.stock_quantity || 0, p.min_stock_level || 5, p.unit || 'each', p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url || null]
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
      'UPDATE products SET barcode=$1, name=$2, category_id=$3, price=$4, cost_price=$5, vat_rate=$6, stock_quantity=$7, min_stock_level=$8, unit=$9, is_weighted=$10, scale_plu=$11, image_url=$12, updated_at=NOW() WHERE id=$13',
      [p.barcode, p.name, p.category_id, p.price, p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock_level, p.unit, p.is_weighted ? 1 : 0, p.scale_plu || null, p.image_url || null, req.params.id]
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

    // Ensure user exists before inserting shift (placeholder if a multi-till id
    // churn removed it) so a shift is never dropped.
    if (s.user_id) {
      await ensureUserRow(s.user_id)
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
          'INSERT INTO users (id, username, display_name, pin_hash, pin_plain, role, active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [u.id, '__sync_temp_' + u.id, u.display_name, u.pin_hash, u.pin_plain ?? null, u.role, u.active]
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
        'INSERT INTO users (id, username, display_name, pin_hash, pin_plain, role, active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [u.id, u.username, u.display_name, u.pin_hash, u.pin_plain ?? null, u.role, u.active]
      )
    }
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] User error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sync a user update (e.g. an admin reset a cashier's PIN on the terminal).
app.put('/api/sync/users/:id', async (req, res) => {
  try {
    const u = req.body
    await db.run(
      'UPDATE users SET display_name=$1, pin_hash=$2, pin_plain=$3, role=$4, active=$5, failed_attempts=0, locked_until=NULL WHERE id=$6',
      [u.display_name, u.pin_hash, u.pin_plain ?? null, u.role, u.active ?? 1, req.params.id]
    )
    res.json({ status: 'synced' })
  } catch (err: any) {
    console.error('[Sync] User update error:', err.message)
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
  res.json({ status: 'ok', engine: 'postgres', migrationsDone })
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
