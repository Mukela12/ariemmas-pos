// Web QA: native inputs on Login, Products (Add Product), Cashiers; and the
// "Scan" button shows only on web. Captures screenshots for review.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = 'http://localhost:5199'
const OUT = '/tmp/qa-web-native'
mkdirSync(OUT, { recursive: true })
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const wait = (ms) => page.waitForTimeout(ms)

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  await wait(800)
  await shot('01-login')

  // Login should have native <input>s (not buttons). The username placeholder
  // should be a real input element.
  const usernameIsInput = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')]
    const userLabel = labels.find(l => /username/i.test(l.textContent || ''))
    const wrap = userLabel?.nextElementSibling
    return !!(wrap && wrap.querySelector('input'))
  })
  log(`Login Username is native <input>: ${usernameIsInput}`)

  // type directly with keyboard
  await page.locator('input[placeholder="Username"]').fill('admin')
  await page.locator('input[placeholder="PIN"]').fill('9012')
  await shot('02-login-filled')
  await page.locator('button[type="submit"]:has-text("Sign In")').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await wait(1500)

  // Products → Add Product
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1500)
  await page.locator('button:has-text("Add Product"), button:has-text("Add New")').first().click(); await wait(800)
  await shot('03-addproduct-empty')

  // Native inputs: the Name field should be an <input> (not a tap-to-open button)
  const addProductHasNativeInputs = await page.evaluate(() => {
    const nameInput = document.querySelector('input[placeholder*="Mealie"]')
    return !!nameInput
  })
  log(`Add Product Name is native <input>: ${addProductHasNativeInputs}`)

  // Type into name and price via the real keyboard
  await page.locator('input[placeholder*="Mealie"]').fill('Web QA Widget')
  await page.locator('input[placeholder*="0.00"]').first().fill('12.50')
  await shot('04-addproduct-typed')

  // Scan button: present on web when BarcodeDetector is supported. Chromium has it.
  const scanBtn = page.getByRole('button', { name: /Scan/ })
  const scanVisible = await scanBtn.isVisible().catch(() => false)
  log(`Camera Scan button visible on web: ${scanVisible}`)
  if (scanVisible) {
    // headless Playwright doesn't grant camera, so we don't actually scan — but
    // we can confirm the modal opens and shows a helpful error.
    await scanBtn.click(); await wait(700)
    await shot('05-scan-modal')
    // close
    await page.keyboard.press('Escape').catch(() => {})
    await wait(300)
  }

  log(`CONSOLE ERRORS (${errors.length}):`); errors.slice(0, 10).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('WEB QA ERROR:', err.message)
  await shot('zz-error').catch(() => {})
} finally { await browser.close() }
