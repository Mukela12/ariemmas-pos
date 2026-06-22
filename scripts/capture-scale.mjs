// Captures the admin "Scale PLU" field for the training guide. Targets the LIVE
// web admin. Fills the Add-Product form but NEVER saves — nothing is written to
// production; we only screenshot the form, then close it.
import { chromium } from 'playwright'

const URL = process.env.CAP_URL || 'https://ariemmas-pos.netlify.app'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const wait = (ms) => page.waitForTimeout(ms)

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 40000 })
  await wait(1000)
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 2000 }).catch(() => false)) { await logout.click(); await wait(1200) }
  await page.locator('input[placeholder="Username"]').first().fill('admin')
  await page.locator('input[placeholder="PIN"]').first().fill('9012')
  await page.getByRole('button', { name: /^Sign In$/ }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
  await wait(1800)

  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1500)
  const addBtn = page.locator('button:has-text("Add Product"), button:has-text("Add New")').first()
  await addBtn.click(); await wait(800)

  // Fill a realistic weighed product (NOT saved).
  await page.locator('input[placeholder*="Mealie"]').first().fill('Beef Sausages').catch(() => {})
  // Selling price = price per kg
  const priceInput = page.locator('input[inputmode="decimal"], input[placeholder="0.00"]').first()
  await priceInput.fill('85').catch(() => {})
  // Tick "Sold by weight" -> the Scale PLU field appears
  const weighted = page.locator('input[type="checkbox"]').first()
  await weighted.check().catch(() => {})
  await wait(500)
  const plu = page.locator('input[placeholder="e.g. 1"]').first()
  await plu.fill('2').catch(() => {})
  await wait(300)
  await plu.scrollIntoViewIfNeeded().catch(() => {})
  await wait(400)
  await page.screenshot({ path: `${IMG}/50-scale-plu.png` })
  log('captured 50-scale-plu.png')

  // Close WITHOUT saving.
  const cancel = page.locator('button:has-text("Cancel")').first()
  if (await cancel.isVisible().catch(() => false)) await cancel.click()
  else await page.keyboard.press('Escape').catch(() => {})

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 8).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('SCALE CAPTURE ERROR:', err.message)
  await page.screenshot({ path: `${IMG}/zz-scale-error.png` }).catch(() => {})
} finally {
  await browser.close()
}
