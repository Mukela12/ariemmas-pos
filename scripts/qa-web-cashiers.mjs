// Web integration QA: admin manages cashiers through the browser → Express
// server → Postgres. Also checks the top-nav clock no longer overlaps the tabs
// at a narrow width. Runs against the local web build + local server.
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const OUT = '/tmp/qa'
const log = (m) => console.log(m)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const wait = (ms) => page.waitForTimeout(ms)
const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 }); await wait(800)

  // login admin / 9012 via on-screen input
  await page.getByText(/Tap to enter your username/i).click(); await wait(300)
  for (const k of ['a', 'd', 'm', 'i', 'n']) { await kbKey(k).click().catch(() => {}) }
  await page.getByRole('button', { name: /^Done$/ }).click(); await wait(300)
  for (const d of ['9', '0', '1', '2']) { await padKey(d).click().catch(() => {}) }
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(() => {}); await wait(2500)

  // Cashiers tab visible on web?
  const tab = page.getByRole('button', { name: 'Cashiers' }).first()
  log('Cashiers tab visible on web -> ' + (await tab.isVisible().catch(() => false)))
  await tab.click(); await wait(1500)
  await page.screenshot({ path: `${OUT}/WEB-cashiers.png` })

  // data via the real client (adminCreds stashed at login -> server verifies)
  const before = await page.evaluate(() => window.api.listUsers())
  const c1 = before.find((u) => u.username === 'cashier1')
  log(`web listUsers: ${before.length} users; cashier1 PIN=${c1?.pin}; mary=${before.find(u=>u.username==='mary')?.role}`)

  const setRes = await page.evaluate((id) => window.api.setUserPin(id, '1234'), c1.id)
  const afterSet = await page.evaluate(() => window.api.listUsers())
  log(`web setUserPin ok=${setRes.ok}; cashier1 now=${afterSet.find(u=>u.username==='cashier1')?.pin}`)

  const addRes = await page.evaluate(() => window.api.createCashier('cashier7', 'Cashier 7', '8888'))
  const afterAdd = await page.evaluate(() => window.api.listUsers())
  log(`web createCashier ok=${addRes.ok}; cashier7 exists=${afterAdd.some(u=>u.username==='cashier7')}`)

  // new pin authenticates over the web, old rejected
  const okNew = await page.evaluate(() => fetch('http://localhost:3001/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'cashier1',pin:'1234'})}).then(r=>r.json()))
  const okOld = await page.evaluate(() => fetch('http://localhost:3001/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'cashier1',pin:'3174'})}).then(r=>r.json()))
  log(`web login cashier1/1234 -> ${okNew ? 'OK' : 'FAIL'}; cashier1/3174 -> ${okOld ? 'OK(!)' : 'rejected'}`)

  // ---- top-nav overlap check at a narrow width ----
  await page.setViewportSize({ width: 980, height: 760 }); await wait(500)
  await page.screenshot({ path: `${OUT}/WEB-nav-narrow.png` })
  // measure: does the clock (if shown) overlap the Settings tab?
  const overlap = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('nav button')]
    const settings = tabs.find(b => b.textContent.trim() === 'Settings')
    const clock = [...document.querySelectorAll('header span')].find(s => /\d\d:\d\d/.test(s.textContent))
    if (!settings) return 'no settings tab'
    if (!clock || clock.offsetParent === null) return 'clock hidden (no overlap)'
    const a = settings.getBoundingClientRect(), b = clock.getBoundingClientRect()
    return (a.right > b.left && b.right > a.left) ? 'OVERLAP' : 'no overlap'
  })
  log('narrow (980px) nav vs clock -> ' + overlap)
  await page.setViewportSize({ width: 1366, height: 800 }); await wait(400)
  await page.screenshot({ path: `${OUT}/WEB-nav-wide.png` })

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach(e => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('WEB CASHIER QA ERROR:', err.message)
  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach(e => log('  - ' + e))
} finally { await browser.close() }
