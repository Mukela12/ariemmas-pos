// Captures the admin-side training screenshots (products, reports, settings +
// the new VAT toggle). Separate from the cashier flow so it needs no sale.
import { chromium } from 'playwright'

const URL = process.env.CAP_URL || 'http://localhost:5199'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const shot = (n) => page.screenshot({ path: `${IMG}/${n}.png` })
const wait = (ms) => page.waitForTimeout(ms)

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await wait(900)
  // Ensure logged out, then sign in as admin
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 2000 }).catch(() => false)) { await logout.click(); await wait(1200) }
  // dismiss anything covering the login (e.g. a lingering thank-you)
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('input[placeholder="Enter username"]').first().fill('admin')
  await page.locator('input[placeholder="Enter PIN"]').first().fill('9012')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await wait(1800)

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
  errors.slice(0, 12).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('ADMIN CAPTURE ERROR:', err.message)
  await shot('zz-admin-error').catch(() => {})
} finally {
  await browser.close()
}
