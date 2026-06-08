// Combined QA: Phase 1 (catalog pull, no clobber) + Phase 2 (inventory: summary,
// adjust stock, movement history, and that a terminal adjust syncs to the cloud;
// plus a web adjust that the terminal then pulls).
import { _electron as electron } from 'playwright'

const API = process.env.QA_API || 'http://localhost:3001'
const log = (m) => console.log(m)
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const jget = async (p) => (await fetch(`${API}${p}`)).json()
const jsend = async (p, body, method = 'POST') => (await fetch(`${API}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()

try {
  // Phase 1 setup: admin adds a product + edits a price on the cloud
  await jsend('/api/products', { name: 'QA Sync Widget', barcode: '9999001', price: 12.34, cost_price: 8, stock_quantity: 50, image_url: tiny })
  const coke0 = (await jget('/api/products?limit=500')).products.find((p) => /Coca-Cola/i.test(p.name))
  await jsend(`/api/products/${coke0.id}`, { ...coke0, price: 99.99 }, 'PUT')
  log(`server: added widget; Coca-Cola price -> 99.99 (server id ${coke0.id.slice(0, 8)})`)

  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: API } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.waitForTimeout(9000)                    // seed + first pull (id adoption)
  await page.evaluate(() => window.api.syncNow()).catch(() => {})
  await page.waitForTimeout(3000)

  // ---- Phase 1 ----
  const local = await page.evaluate(() => window.api.getAllProducts(1, 500))
  const widget = local.products.find((p) => p.name === 'QA Sync Widget')
  const cokeL = local.products.find((p) => /Coca-Cola/i.test(p.name))
  log(`P1 widget pulled: ${widget ? 'YES' : 'NO'}; price-edit pulled: ${cokeL?.price} (want 99.99)`)
  log(`P1 id adoption: terminal Coca-Cola id === server id? ${cokeL?.id === coke0.id}`)

  // ---- Phase 2 ----
  await page.evaluate(() => window.api.login('admin', '9012'))
  const sum0 = await page.evaluate(() => window.api.getInventorySummary())
  log(`P2 summary: ${sum0.items} items, ${sum0.units} units, low ${sum0.lowStock}, out ${sum0.outOfStock}, value ${Math.round(sum0.stockValue)}`)

  const before = cokeL.stock_quantity
  const adj = await page.evaluate(({ id, q }) => window.api.adjustStock(id, q, 'QA delivery', 'restock'), { id: cokeL.id, q: Number(before) + 10 })
  const local2 = await page.evaluate(() => window.api.getAllProducts(1, 500))
  const cokeL2 = local2.products.find((p) => /Coca-Cola/i.test(p.name))
  const movs = await page.evaluate((id) => window.api.getStockMovements(id, 20), cokeL.id)
  log(`P2 adjust ok=${adj?.ok}; local stock ${before} -> ${cokeL2?.stock_quantity} (want +10); movements logged: ${movs.length} (top: ${movs[0]?.type} ${movs[0]?.quantity_change})`)

  // sync the adjust up, verify on the server
  await page.evaluate(() => window.api.syncNow()).catch(() => {})
  await page.waitForTimeout(2500)
  const cokeS = (await jget('/api/products?limit=500')).products.find((p) => /Coca-Cola/i.test(p.name))
  const movS = await jget(`/api/products/${coke0.id}/movements`)
  log(`P2 terminal adjust -> cloud: server stock ${cokeS?.stock_quantity} (want ${Number(before) + 10}); server movements: ${movS.length}`)

  // web admin adjust -> terminal pulls it
  await jsend(`/api/products/${coke0.id}/adjust`, { newQuantity: 7, reason: 'web stock-take', type: 'correction' })
  await page.evaluate(() => window.api.syncNow()).catch(() => {})
  await page.waitForTimeout(2500)
  const local3 = await page.evaluate(() => window.api.getAllProducts(1, 500))
  const cokeL3 = local3.products.find((p) => /Coca-Cola/i.test(p.name))
  log(`P2 web adjust -> terminal pulled: local stock now ${cokeL3?.stock_quantity} (want 7)`)

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  await app.close()
  log('DONE')
} catch (err) {
  console.error('INVENTORY QA ERROR:', err.message)
}
