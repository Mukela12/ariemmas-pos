// End-to-end Phase 1 sync QA: mutate the catalog on the SERVER (as the web admin
// would), then launch the Electron terminal pointed at that server and confirm it
// PULLS the changes (new product, price edit, image), without clobbering them.
import { _electron as electron } from 'playwright'

const API = process.env.QA_API || 'http://localhost:3001'
const log = (m) => console.log(m)
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function jpost(path, body, method = 'POST') {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json().catch(() => null)
}

try {
  // ---- 1. Admin (server side) adds a product + edits a price ----
  await jpost('/api/products', { name: 'QA Sync Widget', barcode: '9999001', price: 12.34, cost_price: 8, stock_quantity: 50, image_url: tinyPng })
  const list = (await (await fetch(`${API}/api/products?limit=500`)).json()).products
  const coke = list.find((p) => /Coca-Cola/i.test(p.name))
  await jpost(`/api/products/${coke.id}`, { ...coke, price: 99.99 }, 'PUT')
  log(`server: added 'QA Sync Widget', edited Coca-Cola price ${coke.price} -> 99.99`)

  // ---- 2. Launch the terminal pointed at this server; let it seed + pull ----
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: API } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.waitForTimeout(9000) // seed + initial push + initial pull (~5s)
  // force one more push+pull to be deterministic
  await page.evaluate(() => window.api.syncNow()).catch(() => {})
  await page.waitForTimeout(3500)

  const local = await page.evaluate(() => window.api.getAllProducts(1, 500))
  const widget = local.products.find((p) => p.name === 'QA Sync Widget')
  const cokeLocal = local.products.find((p) => /Coca-Cola/i.test(p.name))
  log(`terminal pulled NEW product 'QA Sync Widget': ${widget ? `YES (price ${widget.price}, image ${widget.image_url ? 'present' : 'MISSING'})` : 'NO'}`)
  log(`terminal pulled PRICE edit Coca-Cola: ${cokeLocal ? cokeLocal.price : 'not found'} (expect 99.99 — proves no stale-push clobber)`)
  log(`local product count: ${local.products.length}`)

  // ---- 3. Reverse direction already works (push); spot-check server still has 99.99 ----
  const after = (await (await fetch(`${API}/api/products?limit=500`)).json()).products
  const cokeServer = after.find((p) => /Coca-Cola/i.test(p.name))
  log(`server Coca-Cola after terminal online: ${cokeServer?.price} (expect 99.99 — terminal didn't clobber)`)

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  await app.close()
  log('DONE')
} catch (err) {
  console.error('SYNC QA ERROR:', err.message)
}
