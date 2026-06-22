// End-to-end QA for scale-label scanning. Admin links a product to PLU 1 on the
// cloud; the terminal pulls it; then we simulate a hardware scan of a REAL scale
// label (2000001020203 = PLU 1, K20.20) and confirm the till adds the right line
// at the label price. The whole scan path is local (offline-safe).
import { _electron as electron } from 'playwright'

const API = process.env.QA_API || 'http://localhost:3001'
const log = (m) => console.log(m)
const jget = async (p) => (await fetch(`${API}${p}`)).json()
const jsend = async (p, b, m = 'POST') => (await fetch(`${API}${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()

try {
  // Admin: make T-Bone weighted, K20/kg, scale PLU 1 (so the label math is 1.01 kg).
  const tbone = (await jget('/api/products?limit=500')).products.find((p) => /T-Bone/i.test(p.name))
  await jsend(`/api/products/${tbone.id}`, { ...tbone, price: 20, is_weighted: 1, scale_plu: 1 }, 'PUT')
  log(`server: T-Bone -> weighted, K20/kg, scale_plu 1`)

  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: API } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.waitForTimeout(9000) // seed + first catalog pull (gets scale_plu)
  await page.evaluate(() => window.api.syncNow()).catch(() => {})
  await page.waitForTimeout(2500)

  // Data layer: PLU lookup resolves to T-Bone (proves scale_plu synced down).
  const byPlu = await page.evaluate(() => window.api.getProductByPlu(1))
  log(`getProductByPlu(1) -> ${byPlu ? `${byPlu.name} (plu ${byPlu.scale_plu}, K${byPlu.price}/kg)` : 'NOT FOUND'}`)

  // Log in as a cashier so we're on the Sale screen with the scanner live.
  const kb = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
  const pad = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()
  await page.getByText(/Tap to enter your username/i).click(); await page.waitForTimeout(300)
  for (const k of ['c','a','s','h','i','e','r','1']) await kb(k).click().catch(() => {})
  await page.getByRole('button', { name: /^Done$/ }).click(); await page.waitForTimeout(300)
  for (const d of ['3','1','7','4']) await pad(d).click().catch(() => {})
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(() => {})
  await page.waitForTimeout(2500)

  // Simulate the hardware scanner: fast keystrokes of the label barcode + Enter.
  await page.evaluate((code) => {
    for (const ch of code) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }, '2000001020203')
  await page.waitForTimeout(1200)

  const body = await page.evaluate(() => document.body.innerText)
  const hasItem = /T-Bone Steak \(1\.010 kg\)/.test(body)
  const hasPrice = /20\.20/.test(body)
  log(`after scan: cart shows 'T-Bone Steak (1.010 kg)' -> ${hasItem}; shows K20.20 -> ${hasPrice}`)
  await page.screenshot({ path: 'docs/training-guide/img/53-scale-scan.png' })

  // Scan an unlinked PLU -> friendly error, no crash.
  await page.evaluate((code) => {
    for (const ch of code) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }, '2000099000507') // PLU 99 (unlinked), valid check digit
  await page.waitForTimeout(900)
  const body2 = await page.evaluate(() => document.body.innerText)
  log(`unlinked PLU 99 -> shows 'isn't linked' message: ${/isn.t linked/.test(body2)}`)

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  await app.close()
  log('DONE')
} catch (err) {
  console.error('SCALE QA ERROR:', err.message)
}
