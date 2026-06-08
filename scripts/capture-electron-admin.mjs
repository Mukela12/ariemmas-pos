// Captures Reports + Settings (incl. VAT toggle) from the desktop app. The DB
// already has the sale created by the full capture, so Reports show real data.
import { _electron as electron } from 'playwright'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)
const app = await electron.launch({ args: ['out/main/index.js'] })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const shot = (n) => page.screenshot({ path: `${IMG}/${n}.png` })
const wait = (ms) => page.waitForTimeout(ms)
try {
  await wait(3500)
  // log out if a session is active, then sign in as admin
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await wait(1000) }
  await page.locator('input[placeholder="Enter username"]').first().fill('admin')
  await page.locator('input[placeholder="Enter PIN"]').first().fill('9012')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }).catch(() => {})
  await wait(1800)

  // Products (capture the list only — no modal)
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1400)
  await shot('20-products'); log('20 products')

  await page.getByRole('button', { name: 'Reports' }).first().click(); await wait(1800)
  await shot('30-reports-top'); log('30 reports')
  await page.evaluate(() => window.scrollTo(0, 560)); await wait(600); await shot('31-reports-cashier')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(600); await shot('32-reports-transactions')

  await page.getByRole('button', { name: 'Settings' }).first().click(); await wait(1400)
  await shot('40-settings'); log('40 settings')
  await page.getByText('Charge VAT').first().scrollIntoViewIfNeeded().catch(() => {}); await wait(500)
  await shot('42-settings-vat'); log('42 VAT toggle')
  await page.getByText(/Active Printer|Receipt Printer|Test Print/i).first().scrollIntoViewIfNeeded().catch(() => {}); await wait(500)
  await shot('41-settings-hardware'); log('41 hardware')

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('ADMIN CAPTURE ERROR:', err.message); await shot('zz-eadmin-error').catch(() => {})
} finally { await app.close() }
