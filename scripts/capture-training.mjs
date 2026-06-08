// Captures training-guide screenshots from the running app (new graphite UI),
// and doubles as a visual QA pass. Deterministic: it closes any open shift so it
// can always show the Open-Shift + name-keyboard flow. Default target is the
// local web build; override with CAP_URL. Output → docs/training-guide/img/*.png
import { chromium } from 'playwright'

const URL = process.env.CAP_URL || 'http://localhost:5199'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const shot = (name) => page.screenshot({ path: `${IMG}/${name}.png` })
const wait = (ms) => page.waitForTimeout(ms)

async function ensureLoggedOut() {
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await wait(1100) }
}
async function login(user, pin) {
  await ensureLoggedOut()
  await page.locator('input[placeholder="Enter username"]').first().fill(user)
  await page.locator('input[placeholder="Enter PIN"]').first().fill(pin)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await wait(2500) // let the shift state settle (avoids transient "No Shift")
}
async function pillText() {
  const pill = page.locator('button:has-text("No Shift"), button:has-text("Shift Open")').first()
  return ((await pill.textContent().catch(() => '')) || '').trim()
}
async function ensureNoShift() {
  if ((await pillText()).includes('Shift Open')) {
    await page.locator('button:has-text("Shift Open")').first().click(); await wait(700)
    await page.locator('button:has-text("CLOSE")').first().click(); await wait(1900)
  }
}
const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + (d === '.' ? '\\.' : d) + '$') }).first()
// Open the search overlay and type a query (the overlay is the .z-40 panel).
async function openSearch(query) {
  await page.locator('button:has-text("Search for a product")').first().click(); await wait(450)
  await page.locator('input[placeholder*="product name"]').first().fill(query); await wait(1000)
}
// Click a result row inside the search overlay by product name.
async function clickResult(nameRe) {
  await page.locator('.z-40 button', { hasText: nameRe }).first().click(); await wait(700)
}
async function closeSearch() {
  await page.getByRole('button', { name: /^Close$/ }).click().catch(() => {}); await wait(500)
}

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await wait(900)
  await shot('01-login'); log('01 login')
  await page.getByText('Cashier 5').first().click().catch(() => {})
  await wait(400)
  await shot('02-login-filled'); log('02 login filled')

  await login('cashier5', '5555')
  await ensureNoShift()

  // ----- Open shift: name via on-screen keyboard -----
  await page.locator('button:has-text("No Shift")').first().click(); await wait(600)
  await page.getByText(/Tap to type the cashier/i).click(); await wait(500)
  await page.locator('.fixed.inset-x-0.bottom-0 button[aria-label="Shift"]').click().catch(() => {}) // caps on
  await kbKey('m').click().catch(() => {})
  await page.locator('.fixed.inset-x-0.bottom-0 button[aria-label="Shift"]').click().catch(() => {}) // caps off
  for (const k of ['a', 'r', 'y']) { await kbKey(k).click().catch(() => {}) }
  await wait(300)
  await shot('03-open-shift'); log('03 open shift (name keyboard)')
  await page.getByRole('button', { name: /^Done$/ }).click(); await wait(400)
  for (const d of ['5', '0', '0']) { await padKey(d).click().catch(() => {}) }
  await wait(300)
  await shot('03b-open-shift-cash'); log('03b opening cash')
  await page.getByRole('button', { name: /OPEN/ }).click(); await wait(1600)

  await shot('04-pos-empty'); log('04 pos empty')

  // ----- Search overlay -----
  await openSearch('Coca')
  await shot('05-search'); log('05 search overlay')
  await clickResult(/Coca-Cola/i)
  await closeSearch()

  await openSearch('Bread')
  await clickResult(/Bread/i)
  await closeSearch()
  await shot('06-cart-items'); log('06 cart items (main + sidebar)')

  // ----- Weighed item — only if the data actually has a weighted product
  // (the WeightModal opens from the result). Skip cleanly otherwise. -----
  await openSearch('T-Bone')
  await clickResult(/T-Bone/i)
  await wait(500)
  const weighOpen = await page.getByText('Weigh item').isVisible().catch(() => false)
  if (weighOpen) {
    await shot('07-weigh-empty'); log('07 weigh modal')
    for (const k of ['0', '.', '4', '5', '0']) { await padKey(k).click().catch(() => {}) }
    await wait(400)
    await shot('08-weigh-typed'); log('08 weigh typed')
    await page.getByRole('button', { name: /^ADD$/ }).click().catch(() => {}); await wait(900)
    await closeSearch()
    await shot('09-cart-weighted'); log('09 cart weighted')
  } else {
    log('No weighted product in this data — skipping weigh screenshots (07-09)')
    await closeSearch()
  }

  // ----- Drawer toast (QA of the function bar) -----
  await page.getByRole('button', { name: /Drawer/ }).click(); await wait(700)
  await shot('qa-drawer-toast'); log('qa drawer toast')

  // ----- Payment -----
  await page.locator('button:has-text("F12")').first().click().catch(() => {}); await wait(700)
  await shot('10-payment'); log('10 payment')
  for (const d of ['5', '0', '0']) { await padKey(d).click().catch(() => {}) }
  await wait(500)
  await shot('11-payment-change'); log('11 payment change')
  await page.getByRole('button', { name: /PAY/ }).last().click().catch(() => {}); await wait(1800)
  await shot('12-thankyou'); log('12 thank you')
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(683, 60).catch(() => {}); await wait(900)

  // ---------- ADMIN ----------
  await login('admin', '9012')
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1500)
  await shot('20-products'); log('20 products')
  const addBtn = page.locator('button:has-text("Add Product"), button:has-text("Add New")').first()
  await addBtn.click(); await wait(700)
  await page.locator('input[placeholder*="Mealie"]').first().fill('Beef Sausages').catch(() => {})
  const genBtn = page.locator('button:has-text("Generate")').first()
  if (await genBtn.isVisible().catch(() => false)) { await genBtn.click(); await wait(700) }
  await shot('21-add-product'); log('21 add product')
  const weightedToggle = page.locator('input[type="checkbox"]').first()
  if (await weightedToggle.isVisible().catch(() => false)) { await weightedToggle.check().catch(() => {}); await wait(400) }
  await shot('22-weighted-toggle'); log('22 weighted toggle')
  await page.keyboard.press('Escape').catch(() => {}); await wait(500)

  await page.getByRole('button', { name: 'Reports' }).first().click(); await wait(1800)
  await shot('30-reports-top'); log('30 reports top')
  await page.evaluate(() => window.scrollTo(0, 560)); await wait(700)
  await shot('31-reports-cashier'); log('31 reports cashier')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(700)
  await shot('32-reports-transactions'); log('32 reports transactions')

  await page.getByRole('button', { name: 'Settings' }).first().click(); await wait(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('40-settings'); log('40 settings')
  await page.evaluate(() => window.scrollTo(0, 360)); await wait(500)
  await shot('42-settings-vat'); log('42 settings VAT toggle')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(700)
  await shot('41-settings-hardware'); log('41 settings hardware')

  log('CONSOLE ERRORS (' + errors.length + '):')
  errors.slice(0, 20).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('CAPTURE ERROR:', err.message)
  await shot('zz-error').catch(() => {})
  log('CONSOLE ERRORS (' + errors.length + '):')
  errors.slice(0, 20).forEach((e) => log('  - ' + e))
} finally {
  await browser.close()
}
