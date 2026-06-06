import { chromium } from 'playwright'
const URL = 'https://ariemmas-pos.netlify.app'
const IMG = 'docs/training-guide/img'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1000)
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await page.waitForTimeout(1200) }
  await page.locator('input[placeholder="Enter username"]').first().fill('admin')
  await page.locator('input[placeholder="Enter PIN"]').first().fill('9012')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Reports' }).first().click()
  await page.waitForTimeout(2000)
  // Scroll the inner overflow-auto container to the bottom
  await page.evaluate(() => {
    const sc = document.querySelector('.overflow-auto')
    if (sc) sc.scrollTop = sc.scrollHeight
  })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${IMG}/32-reports-transactions.png` })
  console.log('re-captured transactions')
} catch (e) { console.error('ERR', e.message) } finally { await browser.close() }
