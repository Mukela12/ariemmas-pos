// QA the production-bound changes against the local web build.
// Finds a cashier with no open shift so it can exercise the Open-Shift name
// keyboard cleanly. Screens → /tmp/qa/NEW-*.png ; console errors collected.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = 'http://localhost:5199'
const OUT = '/tmp/qa'
mkdirSync(OUT, { recursive: true })
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const shot = (n) => page.screenshot({ path: `${OUT}/NEW-${n}.png` })

async function ensureLoggedOut() {
  const logout = page.locator('button[title="Sign out"]').first()
  if (await logout.isVisible({ timeout: 1500 }).catch(() => false)) { await logout.click(); await page.waitForTimeout(1000) }
}
async function login(user, pin) {
  await ensureLoggedOut()
  await page.locator('input[placeholder="Enter username"]').first().fill(user)
  await page.locator('input[placeholder="Enter PIN"]').first().fill(pin)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)
}
async function pillText() {
  const pill = page.locator('button:has-text("No Shift"), button:has-text("Shift Open")').first()
  return ((await pill.textContent().catch(() => '')) || '').trim()
}

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)

  // Find a cashier with no open shift (so we can show the Open-Shift modal).
  let chosen = null
  for (const [u, p] of [['cashier2', '2222'], ['cashier3', '3333'], ['cashier4', '4444'], ['cashier5', '5555'], ['cashier1', '1111']]) {
    await login(u, p)
    const t = await pillText()
    log(`${u}: ${t}`)
    if (t.includes('No Shift')) { chosen = u; break }
  }
  if (!chosen) { log('No cashier without an open shift; using last login.') }

  // --- Open-Shift modal: name keyboard ---
  if (chosen) {
    await page.locator('button:has-text("No Shift")').first().click()
    await page.waitForTimeout(600)
    await shot('shift-open-modal')
    await page.getByText(/Tap to type the cashier/i).click()
    await page.waitForTimeout(500)
    await shot('shift-name-keyboard')
    for (const k of ['m', 'a', 'r', 'y']) {
      await page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first().click().catch(() => {})
    }
    await page.waitForTimeout(300)
    await shot('shift-name-typed')
    await page.getByRole('button', { name: /^Done$/ }).click()
    await page.waitForTimeout(400)
    // opening cash 500 on the number keypad
    for (const d of ['5', '0', '0']) {
      await page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first().click().catch(() => {})
    }
    await page.waitForTimeout(300)
    await shot('shift-ready')
    await page.getByRole('button', { name: /OPEN/ }).click()
    await page.waitForTimeout(1500)
  }
  await shot('pos-empty')

  // --- Search + add (item must appear on MAIN area + sidebar) ---
  await page.locator('button:has-text("Search for a product")').first().click()
  await page.waitForTimeout(500)
  const search = page.locator('input[placeholder*="product name"]').first()
  await search.fill('Coca'); await page.waitForTimeout(1000)
  await shot('search-results')
  await page.getByText(/Coca-Cola/i).first().click(); await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^Close$/ }).click()
  await page.waitForTimeout(600)
  await shot('main-has-item')

  await page.locator('button:has-text("Search for a product")').first().click()
  await page.waitForTimeout(400)
  await search.fill('Bread'); await page.waitForTimeout(900)
  await page.getByText(/Bread/i).first().click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Close$/ }).click()
  await page.waitForTimeout(600)
  await shot('main-two-items')
  await shot('vat-off-totals') // sidebar should show only Total (no VAT lines)

  // --- Drawer toast (no printer on web -> should show the 'no printer' message) ---
  await page.getByRole('button', { name: /Drawer/ }).click()
  await page.waitForTimeout(700)
  await shot('drawer-toast')

  // --- New Sale toast ---
  await page.getByRole('button', { name: /New Sale/ }).click()
  await page.waitForTimeout(500)
  await shot('newsale-toast')

  // ---------- ADMIN: VAT toggle ----------
  await login('admin', '9012')
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, 360))
  await page.waitForTimeout(500)
  await shot('settings-vat-toggle')

  log('CONSOLE ERRORS (' + errors.length + '):')
  errors.slice(0, 20).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('QA ERROR:', err.message)
  await shot('zz-error').catch(() => {})
  log('CONSOLE ERRORS (' + errors.length + '):')
  errors.slice(0, 20).forEach((e) => log('  - ' + e))
} finally {
  await browser.close()
}
