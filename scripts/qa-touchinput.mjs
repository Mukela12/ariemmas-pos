// QA the on-screen keyboards on admin screens (Add Product, Settings) + the
// login form position. Real desktop app.
import { _electron as electron } from 'playwright'
const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)
const app = await electron.launch({ args: ['out/main/index.js'] })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const wait = (ms) => page.waitForTimeout(ms)
const kbVisible = () => page.locator('.fixed.inset-x-0.bottom-0').last().isVisible().catch(() => false)
const hasLetters = () => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: /^q$/i }).count().then(c => c > 0).catch(() => false)
const hasKeypad = () => page.locator('.fixed.inset-x-0.bottom-0 .grid button', { hasText: /^7$/ }).count().then(c => c > 0).catch(() => false)

try {
  await wait(4000)
  await page.screenshot({ path: `${IMG}/45-login-position.png` }); log('captured login')
  // login form vertical position (should be roughly centered, not glued to top)
  const pos = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Tap to enter your username/i.test(x.textContent || ''))
    return b ? Math.round(b.getBoundingClientRect().top) + ' / ' + window.innerHeight : 'n/a'
  })
  log('username field top / viewport height = ' + pos)

  // login admin
  const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
  const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()
  await page.getByText(/Tap to enter your username/i).click(); await wait(300)
  for (const k of ['a','d','m','i','n']) await kbKey(k).click().catch(()=>{})
  await page.getByRole('button', { name: /^Done$/ }).click(); await wait(300)
  for (const d of ['9','0','1','2']) await padKey(d).click().catch(()=>{})
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(()=>{}); await wait(2500)

  // ---- Add Product ----
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1200)
  await page.locator('button:has-text("Add Product"), button:has-text("Add New")').first().click(); await wait(800)

  // tap the Barcode field (numeric) first -> number keypad
  await page.getByText('Scan, type, or generate').click().catch(()=>{}); await wait(500)
  const kp = await hasKeypad()
  log('Add Product · Barcode (numeric) tapped -> keypad: ' + kp)
  await page.screenshot({ path: `${IMG}/47-addproduct-keypad.png` })
  // close keypad via its Done, then tap Name -> letters keyboard
  await page.getByRole('button', { name: /^Done$/ }).click().catch(()=>{}); await wait(300)
  await page.getByText('e.g. Mealie Meal 25kg').click().catch(()=>{}); await wait(500)
  const letters = await hasLetters(); const keypadGone = !(await hasKeypad())
  log('Add Product · Name tapped -> letters keyboard: ' + letters + '; keypad gone (single active): ' + keypadGone)
  await page.screenshot({ path: `${IMG}/46-addproduct-keyboard.png` })
  // close modal
  await page.keyboard.press('Escape').catch(()=>{}); await wait(400)
  await page.mouse.click(20, 20).catch(()=>{}); await wait(500)

  // ---- Settings ----
  await page.getByRole('button', { name: 'Settings' }).first().click(); await wait(1200)
  await page.getByText('Ariemmas', { exact: true }).first().click().catch(()=>{}) // shop name value, may vary
  // tap the Shop Name field by its current value or placeholder
  const shopBtn = page.locator('button', { hasText: /Ariemmas/ }).first()
  await shopBtn.click().catch(()=>{}); await wait(500)
  log('Settings · Shop Name tapped -> letters keyboard: ' + (await hasLetters()))
  await page.screenshot({ path: `${IMG}/48-settings-keyboard.png` })

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0,12).forEach(e=>log('  - '+e))
  log('DONE')
} catch (err) {
  console.error('TOUCHINPUT QA ERROR:', err.message)
  await page.screenshot({ path: `${IMG}/zz-touch-error.png` }).catch(()=>{})
  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0,12).forEach(e=>log('  - '+e))
} finally { await app.close() }
