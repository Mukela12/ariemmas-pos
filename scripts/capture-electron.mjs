// Full training-guide capture from the REAL desktop app (Electron + local SQLite),
// fresh seed (weighted T-Bone, admin/9012). Run after `npm run build` and after
// deleting ./ariemmas-pos.db. Output → docs/training-guide/img/*.png
import { _electron as electron } from 'playwright'

const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)

const app = await electron.launch({ args: ['out/main/index.js'] })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const shot = (n) => page.screenshot({ path: `${IMG}/${n}.png` })
const wait = (ms) => page.waitForTimeout(ms)

async function ensureLoggedOut() {
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await wait(1000) }
}
async function login(user, pin) {
  await ensureLoggedOut()
  await page.locator('input[placeholder="Enter username"]').first().fill(user)
  await page.locator('input[placeholder="Enter PIN"]').first().fill(pin)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }).catch(() => {})
  await wait(1500)
}
const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + (d === '.' ? '\\.' : d) + '$') }).first()
async function openSearch(q) {
  await page.locator('button:has-text("Search for a product")').first().click(); await wait(400)
  await page.locator('input[placeholder*="product name"]').first().fill(q); await wait(900)
}
const clickResult = (re) => page.locator('.z-40 button', { hasText: re }).first().click()
const closeSearch = async () => { await page.getByRole('button', { name: /^Close$/ }).click().catch(() => {}); await wait(450) }

try {
  await wait(4000) // first-run seed + window load
  await shot('01-login'); log('01 login')
  await page.getByText('Cashier 1').first().click().catch(() => {}); await wait(400)
  await shot('02-login-filled'); log('02 login filled')

  // ----- Open shift with the name keyboard -----
  await login('cashier1', '1111')
  const pill = page.locator('button:has-text("No Shift"), button:has-text("Shift Open")').first()
  if (((await pill.textContent().catch(() => '')) || '').includes('No Shift')) {
    await pill.click(); await wait(600)
    await page.getByText(/Tap to type the cashier/i).click().catch(() => {}); await wait(400)
    await page.locator('.fixed.inset-x-0.bottom-0 button[aria-label="Shift"]').click().catch(() => {})
    await kbKey('m').click().catch(() => {})
    await page.locator('.fixed.inset-x-0.bottom-0 button[aria-label="Shift"]').click().catch(() => {})
    for (const k of ['a', 'r', 'y']) { await kbKey(k).click().catch(() => {}) }
    await wait(300)
    await shot('03-open-shift'); log('03 open shift + name keyboard')
    await page.getByRole('button', { name: /^Done$/ }).click().catch(() => {}); await wait(400)
    for (const d of ['5', '0', '0']) { await padKey(d).click().catch(() => {}) }
    await page.getByRole('button', { name: /OPEN/ }).click().catch(() => {}); await wait(1500)
  }
  await shot('04-pos-empty'); log('04 pos empty')

  // ----- Search (with results) + add two items -----
  await openSearch('Coca')
  await shot('05-search'); log('05 search overlay')
  await clickResult(/Coca-Cola/i); await wait(500); await closeSearch()
  await openSearch('Bread'); await clickResult(/Bread/i); await wait(400); await closeSearch()
  await shot('06-cart-items'); log('06 cart items')

  // ----- Weighed item (T-Bone is seeded weighted) -----
  await openSearch('T-Bone'); await clickResult(/T-Bone/i); await wait(700)
  if (await page.getByText('Weigh item').isVisible().catch(() => false)) {
    await shot('07-weigh-empty'); log('07 weigh modal')
    for (const k of ['0', '.', '4', '5', '0']) { await padKey(k).click().catch(() => {}) }
    await wait(400)
    await shot('08-weigh-typed'); log('08 weigh typed')
    await page.getByRole('button', { name: /^ADD$/ }).click().catch(() => {}); await wait(700)
    await closeSearch()
    await shot('09-cart-weighted'); log('09 cart weighted')
  } else { log('!! WeightModal did not open'); await shot('zz-weigh-fail'); await closeSearch() }

  // ----- Drawer toast -----
  await page.getByRole('button', { name: /Drawer/ }).click().catch(() => {}); await wait(700)
  await shot('qa-drawer-toast'); log('drawer toast')

  // ----- Payment -----
  await page.locator('button:has-text("F12")').first().click().catch(() => {}); await wait(700)
  await shot('10-payment'); log('10 payment')
  for (const d of ['5', '0', '0']) { await padKey(d).click().catch(() => {}) }
  await wait(400)
  await shot('11-payment-change'); log('11 payment change')
  await page.getByRole('button', { name: /PAY/ }).last().click().catch(() => {}); await wait(1500)
  await shot('12-thankyou'); log('12 thank you')
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(640, 60).catch(() => {}); await wait(900)

  // ----- ADMIN -----
  await login('admin', '9012')
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1400)
  await shot('20-products'); log('20 products')
  await page.locator('button:has-text("Add Product"), button:has-text("Add New")').first().click().catch(() => {}); await wait(700)
  await page.locator('input[placeholder*="Mealie"]').first().fill('Beef Sausages').catch(() => {})
  const genBtn = page.locator('button:has-text("Generate")').first()
  if (await genBtn.isVisible().catch(() => false)) { await genBtn.click(); await wait(700) }
  await shot('21-add-product'); log('21 add product')
  const wt = page.locator('input[type="checkbox"]').first()
  if (await wt.isVisible().catch(() => false)) { await wt.check().catch(() => {}); await wait(400) }
  await shot('22-weighted-toggle'); log('22 weighted toggle')
  await page.keyboard.press('Escape').catch(() => {}); await wait(500)

  await page.getByRole('button', { name: 'Reports' }).first().click(); await wait(1600)
  await shot('30-reports-top'); log('30 reports')
  await page.evaluate(() => window.scrollTo(0, 560)); await wait(600); await shot('31-reports-cashier')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(600); await shot('32-reports-transactions')

  await page.getByRole('button', { name: 'Settings' }).first().click(); await wait(1400)
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('40-settings'); log('40 settings')
  await page.evaluate(() => window.scrollTo(0, 360)); await wait(500); await shot('42-settings-vat'); log('42 VAT toggle')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(600); await shot('41-settings-hardware')

  log('CONSOLE ERRORS (' + errors.length + '):')
  errors.slice(0, 12).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('ELECTRON CAPTURE ERROR:', err.message)
  await shot('zz-electron-error').catch(() => {})
} finally {
  await app.close()
}
