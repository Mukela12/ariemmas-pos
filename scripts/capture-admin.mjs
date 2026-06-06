import { chromium } from 'playwright'
const URL = 'https://ariemmas-pos.netlify.app'
const IMG = 'docs/training-guide/img'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const shot = (n) => page.screenshot({ path: `${IMG}/${n}.png` })
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1000)
  // already logged in? sign out
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await page.waitForTimeout(1200) }
  await page.locator('input[placeholder="Enter username"]').first().fill('admin')
  await page.locator('input[placeholder="Enter PIN"]').first().fill('9012')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(2000)

  // Reports
  await page.getByRole('button', { name: 'Reports' }).first().click()
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
  await shot('30-reports-top'); console.log('30 reports top')
  await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(700)
  await shot('31-reports-cashier'); console.log('31 reports cashier')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(700)
  await shot('32-reports-transactions'); console.log('32 reports transactions')

  // Settings
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
  await shot('40-settings'); console.log('40 settings')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(700)
  await shot('41-settings-hardware'); console.log('41 settings hardware')
  console.log('DONE')
} catch (e) { console.error('ERR', e.message); await shot('zz-admin-error').catch(()=>{}) } finally { await browser.close() }
