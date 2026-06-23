// Deep QA: offline sales must NOT be lost and MUST sync when the POS is online
// again. We run a real local server as "the cloud", make a sale online, then kill
// the server (offline), make more sales, confirm they stay queued (not failed),
// bring the server back, and confirm everything syncs.
import { _electron as electron } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { openSync } from 'node:fs'

const PORT = 3007
const API = `http://localhost:${PORT}`
const DB = process.env.QA_DB || 'postgres://localhost:5432/ariemmas_syncqa'
const log = (m) => console.log(m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function startServer() {
  const out = openSync('/tmp/qa-server.log', 'a')
  const s = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT) },
    stdio: ['ignore', out, out], detached: false
  })
  s.unref?.()
  return s
}
function stopServer() {
  try { execSync(`pkill -f "src/server/index.ts" || true`, { stdio: 'ignore' }) } catch { /* */ }
}
async function waitHealth(up, timeoutMs = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    let ok = false
    try { const r = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) }); ok = r.ok } catch { ok = false }
    if (ok === up) return true
    await sleep(500)
  }
  return false
}

try {
  stopServer(); await sleep(1000)
  startServer(); await waitHealth(true); log('1) server UP (the "cloud")')

  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: API } })
  const page = await app.firstWindow()
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message))
  await sleep(11000) // seed + initial push of users/products to the server

  const sess = await page.evaluate(async () => {
    const u = await window.api.login('cashier1', '3174')
    if (!u) return { error: 'login failed' }
    const shift = await window.api.openShift(u.id, 100, 'QA Tester')
    // Sell a product that exists on the server too (T-Bone is in the server seed,
    // barcode 3121338) — the real shop sells cloud products pulled to the till.
    let p = await window.api.getProductByBarcode('3121338')
    if (!p) { const r = await window.api.getAllProducts(1, 5); p = (r.products || r)[0] }
    return { userId: u.id, shiftId: shift?.id, product: p && { id: p.id, name: p.name, price: Number(p.price), vat_rate: Number(p.vat_rate), barcode: p.barcode } }
  })
  if (sess.error || !sess.product) throw new Error('setup failed: ' + JSON.stringify(sess))
  log(`2) logged in + shift open; selling "${sess.product.name}"`)

  const makeSale = () => page.evaluate(async (s) => {
    const p = s.product
    const item = { product_id: p.id, barcode: p.barcode, name: p.name, price: p.price, vat_rate: p.vat_rate, quantity: 1, line_total: p.price, vat_amount: 0, is_weighted: false, image_url: null, image_filename: null }
    const sale = await window.api.completeSale({ items: [item], subtotal: p.price, vat_total: 0, total: p.price, payment_method: 'cash', amount_tendered: p.price, change_given: 0, mobile_ref: null, user_id: s.userId, shift_id: s.shiftId })
    return sale?.id
  }, sess)
  const status = () => page.evaluate(() => window.api.getSyncStatus())
  const syncNow = async (n = 1) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.api.syncNow()).catch(() => {}); await sleep(2200) } }

  // ONLINE sale
  await makeSale(); await syncNow(2)
  log(`3) ONLINE sale made → ${JSON.stringify(await status())}`)

  // OFFLINE: kill the server, make 2 sales
  stopServer(); await waitHealth(false, 10000); log('4) server DOWN (POS now offline)')
  await makeSale(); await makeSale()
  await syncNow(4)
  const off = await status()
  log(`5) made 2 OFFLINE sales, synced 4×: ${JSON.stringify(off)}  (expect pending≈2, failed 0)`)

  // RECONNECT
  startServer(); await waitHealth(true); log('6) server BACK UP (POS online again)')
  await syncNow(4)
  const on = await status()
  log(`7) after reconnect: ${JSON.stringify(on)}  (expect pending 0, failed 0)`)

  log('PAGEERRORS: ' + errs.length); errs.slice(0, 6).forEach((e) => log('  ' + e))
  await app.close()
  log(`RESULT pending=${on.pending} failed=${on.failed}`)
  log((off.failed === 0 && on.pending === 0 && on.failed === 0) ? 'SYNC ROBUSTNESS: PASS' : 'SYNC ROBUSTNESS: FAIL')
  log('DONE')
} catch (e) {
  console.error('QA ERROR:', e.message)
} finally {
  stopServer()
}
