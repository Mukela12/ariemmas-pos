// Captures screenshots from the live ariemmas-pos.netlify.app for the
// training guide. Output → docs/training-guide/img/*.png
import { chromium } from 'playwright'

const URL = 'https://ariemmas-pos.netlify.app'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 850 },
  deviceScaleFactor: 2, // crisp retina screenshots for print
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
})
const page = await ctx.newPage()
const shot = (name) => page.screenshot({ path: `${IMG}/${name}.png` })

async function ensureLoggedOut() {
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) {
    await logout.click(); await page.waitForTimeout(1200)
  }
}

try {
  // ---------- CASHIER FLOW ----------
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot('01-login'); log('01 login')

  // Fill a cashier credential by clicking the row
  await page.getByText('Cashier 1').first().click()
  await page.waitForTimeout(400)
  await shot('02-login-filled'); log('02 login filled')

  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)

  // Open-shift modal (force a fresh shift if already open, close then reopen is messy;
  // just open the modal if "No Shift", else screenshot the open modal by clicking pill)
  const pill = page.locator('button:has-text("No Shift"), button:has-text("Shift Open")').first()
  const pillText = (await pill.textContent().catch(() => '')) || ''
  if (pillText.includes('No Shift')) {
    await pill.click(); await page.waitForTimeout(500)
    const nameField = page.locator('input[placeholder*="Banda"]').first()
    if (await nameField.isVisible().catch(() => false)) await nameField.fill('Mary Banda')
    await shot('03-open-shift'); log('03 open shift')
    await page.getByRole('button', { name: /open shift/i }).click()
    await page.waitForTimeout(1500)
  } else {
    // Already open — still capture the modal in its open-shift form by showing close view
    await pill.click(); await page.waitForTimeout(500)
    await shot('03-open-shift'); log('03 shift modal (already open variant)')
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  }

  // Empty POS
  await shot('04-pos-empty'); log('04 pos empty')

  // Search a normal product
  const search = page.locator('input[placeholder*="Search"], input[placeholder*="barcode"]').first()
  await search.click(); await search.fill('Coca')
  await page.waitForTimeout(900)
  await shot('05-search'); log('05 search dropdown')

  // Add it
  await page.getByText(/Coca-Cola/i).first().click()
  await page.waitForTimeout(700)
  await search.fill('Bread'); await page.waitForTimeout(800)
  await page.getByText(/Bread/i).first().click()
  await page.waitForTimeout(700)
  await shot('06-cart-items'); log('06 cart with items')

  // Weighted product → weigh modal
  await search.click(); await search.fill('T-Bone')
  await page.waitForTimeout(900)
  await page.getByText('T-Bone Steak').first().click()
  await page.waitForTimeout(1000)
  await shot('07-weigh-empty'); log('07 weigh modal empty')

  const weightInput = page.locator('input[type="number"][step="0.001"]').first()
  await weightInput.fill('0.450'); await page.waitForTimeout(500)
  await shot('08-weigh-typed'); log('08 weigh typed')

  await page.getByRole('button', { name: /add to cart/i }).click()
  await page.waitForTimeout(900)
  await shot('09-cart-weighted'); log('09 cart with weighted item')

  // Payment modal
  const payBtn = page.locator('button:has-text("Pay K")').first()
  await payBtn.click(); await page.waitForTimeout(800)
  await shot('10-payment'); log('10 payment modal')

  // Enter cash to show change
  const cashInput = page.locator('input[type="number"]').first()
  await cashInput.fill('500'); await page.waitForTimeout(600)
  await shot('11-payment-change'); log('11 payment with change')

  // Complete the sale
  const confirm = page.locator('button:has-text("Pay K"), button:has-text("Confirm")').last()
  await confirm.click(); await page.waitForTimeout(1800)
  await shot('12-thankyou'); log('12 thank you')

  // Dismiss thank-you
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(683, 60).catch(() => {})
  await page.waitForTimeout(1000)

  // ---------- ADMIN FLOW ----------
  await ensureLoggedOut()
  await page.waitForTimeout(800)
  // login as admin
  const userField = page.locator('input[placeholder="Enter username"]').first()
  await userField.fill('admin')
  const pinField = page.locator('input[placeholder="Enter PIN"]').first()
  await pinField.fill('9012')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(1800)

  // Products page
  await page.getByRole('button', { name: 'Products' }).first().click()
  await page.waitForTimeout(1500)
  await shot('20-products'); log('20 products list')

  // Add product modal
  const addBtn = page.locator('button:has-text("Add Product"), button:has-text("Add New")').first()
  await addBtn.click(); await page.waitForTimeout(700)
  // Fill a sample
  await page.locator('input[placeholder*="Mealie"]').first().fill('Beef Sausages').catch(() => {})
  // Generate barcode
  const genBtn = page.locator('button:has-text("Generate")').first()
  if (await genBtn.isVisible().catch(() => false)) { await genBtn.click(); await page.waitForTimeout(700) }
  await shot('21-add-product'); log('21 add product + barcode')

  // Tick weighted
  const weightedToggle = page.locator('input[type="checkbox"]').first()
  if (await weightedToggle.isVisible().catch(() => false)) { await weightedToggle.check().catch(() => {}); await page.waitForTimeout(400) }
  await shot('22-weighted-toggle'); log('22 weighted toggle')
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)

  // Reports
  await page.getByRole('button', { name: 'Reports' }).first().click()
  await page.waitForTimeout(1800)
  await shot('30-reports-top'); log('30 reports top')
  // Scroll to cashier + transactions
  await page.evaluate(() => window.scrollTo(0, 560))
  await page.waitForTimeout(800)
  await shot('31-reports-cashier'); log('31 reports by cashier')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await shot('32-reports-transactions'); log('32 reports transactions')

  // Settings
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('40-settings'); log('40 settings')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(700)
  await shot('41-settings-hardware'); log('41 settings hardware')

  log('DONE')
} catch (err) {
  console.error('CAPTURE ERROR:', err.message)
  await shot('zz-error').catch(() => {})
} finally {
  await browser.close()
}
