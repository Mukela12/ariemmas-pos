// Drives ariemmas-pos.netlify.app as a cashier and verifies the full
// butchery / weight-pricing flow described in the response. Saves a
// screenshot at every meaningful step.

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const URL = 'https://ariemmas-pos.netlify.app'
const SHOTS = '/tmp/qa-shots'

const report = []
function step(name, ok, detail = '') {
  report.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
})
const page = await ctx.newPage()

try {
  // 1) Login screen
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/01-login.png`, fullPage: false })
  step('Login screen loads', true)

  // 2) Click the Cashier 1 row to auto-fill, then submit
  await page.getByText('Cashier 1').first().click({ timeout: 5000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/02-creds-filled.png`, fullPage: false })
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/03-after-login.png`, fullPage: false })
  step('Sign in as cashier1', true)

  // 3) Ensure shift open — find/click the Shift pill and open if needed
  const shiftPill = page.locator('button:has-text("No Shift"), button:has-text("Shift Open")').first()
  const shiftText = await shiftPill.textContent().catch(() => '')
  if (shiftText && shiftText.includes('No Shift')) {
    await shiftPill.click()
    await page.waitForTimeout(500)
    // The open-shift modal should ask for cashier's name first
    const nameInput = page.locator('input[placeholder*="Mary Banda"], input[placeholder*="Banda"]').first()
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill('QA Tester')
      step('Modal asks for cashier name', true, 'as documented')
    } else {
      step('Modal asks for cashier name', false, 'name field not found')
    }
    await page.screenshot({ path: `${SHOTS}/04-shift-open-modal.png`, fullPage: false })
    await page.getByRole('button', { name: /open shift/i }).click()
    await page.waitForTimeout(1500)
  } else {
    step('Shift already open', true)
  }
  await page.screenshot({ path: `${SHOTS}/05-pos-ready.png`, fullPage: false })

  // 4) Search for T-Bone Steak
  const search = page.locator('input[placeholder*="Search"], input[placeholder*="barcode"]').first()
  await search.click()
  await search.fill('T-Bone')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${SHOTS}/06-search-tbone.png`, fullPage: false })
  step('Search field accepts query', true)

  // 5) Click T-Bone Steak from the results
  await page.getByText('T-Bone Steak').first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/07-after-tbone-click.png`, fullPage: false })

  // 6) Verify the Weigh item modal appeared
  const weighHeading = page.getByText(/weigh item/i).first()
  const weighVisible = await weighHeading.isVisible({ timeout: 3000 }).catch(() => false)
  step('Weigh item modal opens for is_weighted product', weighVisible)

  if (weighVisible) {
    // 7) Verify product name + per-kg price line
    const perKg = await page.getByText(/per kg/i).first().textContent().catch(() => '')
    step('Modal shows "per kg" price line', !!perKg, perKg.trim())

    // 8) Verify weight input is present, focused, and accepts decimals
    const weightInput = page.locator('input[type="number"][step="0.001"]').first()
    const inputVisible = await weightInput.isVisible({ timeout: 1500 }).catch(() => false)
    step('Weight input visible (step 0.001)', inputVisible)

    await weightInput.fill('0.450')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/08-weight-typed.png`, fullPage: false })

    // 9) Verify live line total updates
    const lineTotal = await page.getByText(/line total/i).locator('..').textContent().catch(() => '')
    const hasExpectedTotal = /K\s*130\.50/.test(lineTotal) || /130\.50/.test(lineTotal)
    step('Live line total = K 130.50 (0.450 × 289.99)', hasExpectedTotal, lineTotal.replace(/\s+/g, ' ').trim().slice(0, 80))

    // 10) Click Add to cart
    await page.getByRole('button', { name: /add to cart/i }).click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SHOTS}/09-after-add.png`, fullPage: false })

    // 11) Verify cart row shows name + weight
    const cartBody = await page.locator('body').textContent()
    const inCart = /T-Bone Steak.*\(0\.450 kg\)/.test(cartBody || '')
    step('Cart row shows "T-Bone Steak (0.450 kg)"', inCart, inCart ? 'matched' : 'pattern not found')

    // 12) Verify line total K 130.50 in cart
    const cartTotal = /130\.50/.test(cartBody || '')
    step('Cart row line total includes 130.50', cartTotal)
  }

  // Final state
  await page.screenshot({ path: `${SHOTS}/10-final.png`, fullPage: true })
} catch (err) {
  console.error('QA crashed:', err.message)
  await page.screenshot({ path: `${SHOTS}/crash.png`, fullPage: true }).catch(() => {})
} finally {
  writeFileSync(`${SHOTS}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}

console.log('\n=== SUMMARY ===')
const passed = report.filter(r => r.ok).length
console.log(`${passed} / ${report.length} checks passed`)
