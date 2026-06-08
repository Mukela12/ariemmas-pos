// QA the Cashiers admin feature on the real desktop app:
//  - admin can see current PINs + the list is correct
//  - changing a PIN persists and the new PIN works (old one fails)
//  - adding a cashier works
//  - changes SURVIVE an app restart (version-gated seed doesn't revert them)
import { _electron as electron } from 'playwright'

const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)
const errors = []

async function launch() {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  const page = await app.firstWindow()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.waitForTimeout(4000) // seed + load
  return { app, page }
}

try {
  // ---------- Session 1: log in (UI) as admin, open Cashiers, change + add ----------
  let { app, page } = await launch()
  const wait = (ms) => page.waitForTimeout(ms)
  const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
  const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()

  // login admin / 9012 via the on-screen keyboard + keypad
  await page.getByText(/Tap to enter your username/i).click(); await wait(300)
  for (const k of ['a', 'd', 'm', 'i', 'n']) { await kbKey(k).click().catch(() => {}) }
  await page.getByRole('button', { name: /^Done$/ }).click(); await wait(300)
  for (const d of ['9', '0', '1', '2']) { await padKey(d).click().catch(() => {}) }
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(() => {}); await wait(2500)

  // open Cashiers
  await page.getByRole('button', { name: 'Cashiers' }).first().click(); await wait(1200)
  await page.screenshot({ path: `${IMG}/43-cashiers.png` }); log('captured 43-cashiers')

  // reveal all PINs for the screenshot
  for (const b of await page.locator('button[title="Show"]').all()) { await b.click().catch(() => {}) }
  await wait(400)
  await page.screenshot({ path: `${IMG}/44-cashiers-revealed.png` }); log('captured 44-cashiers-revealed')

  // data assertions via the IPC (admin is logged in)
  const before = await page.evaluate(() => window.api.listUsers())
  const c1 = before.find((u) => u.username === 'cashier1')
  const mary = before.find((u) => u.username === 'mary')
  log(`list: ${before.length} users; cashier1 PIN=${c1?.pin}; mary role=${mary?.role}`)

  // change cashier1 PIN -> 1234
  const setRes = await page.evaluate((id) => window.api.setUserPin(id, '1234'), c1.id)
  const afterSet = await page.evaluate(() => window.api.listUsers())
  log(`setUserPin ok=${setRes.ok}; cashier1 PIN now=${afterSet.find((u) => u.username === 'cashier1')?.pin}`)

  // add cashier6
  const addRes = await page.evaluate(() => window.api.createCashier('cashier6', 'Cashier 6', '9999'))
  const afterAdd = await page.evaluate(() => window.api.listUsers())
  log(`createCashier ok=${addRes.ok}; cashier6 exists=${afterAdd.some((u) => u.username === 'cashier6')}`)

  await app.close()
  await new Promise((r) => setTimeout(r, 1200)) // plain delay (session-1 page is gone)

  // ---------- Session 2: relaunch (seed runs again) and verify persistence ----------
  ;({ app, page } = await launch())
  // log in as admin via IPC so we can read the list
  await page.evaluate(() => window.api.login('admin', '9012'))
  const after = await page.evaluate(() => window.api.listUsers())
  const c1b = after.find((u) => u.username === 'cashier1')
  const c6b = after.find((u) => u.username === 'cashier6')
  log(`AFTER RESTART: cashier1 PIN=${c1b?.pin} (expect 1234 = persisted); cashier6 exists=${!!c6b}`)

  // new PIN works, old PIN rejected
  const okNew = await page.evaluate(() => window.api.login('cashier1', '1234'))
  const okOld = await page.evaluate(() => window.api.login('cashier1', '3174'))
  log(`login cashier1/1234 (new) -> ${okNew ? 'OK' : 'FAIL'}; cashier1/3174 (old) -> ${okOld ? 'OK(!)' : 'rejected'}`)

  await app.close()
  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('CASHIER QA ERROR:', err.message)
  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
}
