// OFFLINE end-to-end QA for scale scanning. No server (sync unreachable). We set
// a scale PLU on a product LOCALLY (as a till would, with no cloud), then simulate
// scanning that product's scale label and confirm it rings up. This isolates the
// desktop scan path from the cloud.
import { _electron as electron } from 'playwright'

const log = (m) => console.log(m)
function ean13Check(first12) {
  let s = 0
  for (let i = 0; i < 12; i++) { const d = first12.charCodeAt(i) - 48; s += i % 2 === 0 ? d : d * 3 }
  return (10 - (s % 10)) % 10
}
// PLU 4, value 1250 ngwee = K12.50
const first12 = '2' + '000004' + '01250'
const LABEL = first12 + ean13Check(first12)
log(`test label = ${LABEL} (PLU 4, K12.50)`)

try {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: 'http://127.0.0.1:59999' } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.waitForTimeout(7000) // seed; sync will fail (offline) — that's fine

  // Create a weighted product with a scale PLU, locally (no cloud).
  const created = await page.evaluate(async () => {
    const p = await window.api.createProduct({
      name: 'QA Liver', price: 12.5, cost_price: 8, vat_rate: 0.16,
      stock_quantity: 50, min_stock_level: 5, unit: 'kg', is_weighted: 1, scale_plu: 4
    })
    return { id: p?.id, name: p?.name, scale_plu: p?.scale_plu }
  })
  log(`created locally: ${JSON.stringify(created)}`)

  const byPlu = await page.evaluate(() => window.api.getProductByPlu(4))
  log(`getProductByPlu(4) -> ${byPlu ? `${byPlu.name} (plu ${byPlu.scale_plu})` : 'NOT FOUND'}`)

  // Log in as cashier so the scanner is live on the Sale screen.
  const kb = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
  const pad = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()
  await page.getByText(/Tap to enter your username/i).click(); await page.waitForTimeout(300)
  for (const k of ['c','a','s','h','i','e','r','1']) await kb(k).click().catch(() => {})
  await page.getByRole('button', { name: /^Done$/ }).click(); await page.waitForTimeout(300)
  for (const d of ['3','1','7','4']) await pad(d).click().catch(() => {})
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(() => {})
  await page.waitForTimeout(2500)

  // Simulate the hardware scanner typing the label + Enter.
  await page.evaluate((code) => {
    for (const ch of code) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }, LABEL)
  await page.waitForTimeout(1200)

  const body = await page.evaluate(() => document.body.innerText)
  const hasItem = /QA Liver \(1\.000 kg\)/.test(body)
  const hasPrice = /12\.50/.test(body)
  log(`after scan: cart shows 'QA Liver (1.000 kg)' -> ${hasItem}; shows K12.50 -> ${hasPrice}`)
  await page.screenshot({ path: '/tmp/qa-offline-scan.png' })

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 10).forEach((e) => log('  - ' + e))
  await app.close()
  log(hasItem && hasPrice ? 'OFFLINE SCAN: PASS' : 'OFFLINE SCAN: FAIL')
  log('DONE')
} catch (err) {
  console.error('OFFLINE QA ERROR:', err.message)
}
