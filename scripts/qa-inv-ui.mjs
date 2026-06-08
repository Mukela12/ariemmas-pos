import { _electron as electron } from 'playwright'
const API = process.env.QA_API || 'http://localhost:3001'
const log = (m) => console.log(m)
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SYNC_API_URL: API } })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const wait = (ms) => page.waitForTimeout(ms)
const kb = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
const pad = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()
try {
  await wait(8000)
  // login admin
  await page.getByText(/Tap to enter your username/i).click(); await wait(300)
  for (const k of ['a','d','m','i','n']) await kb(k).click().catch(()=>{})
  await page.getByRole('button', { name: /^Done$/ }).click(); await wait(300)
  for (const d of ['9','0','1','2']) await pad(d).click().catch(()=>{})
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(()=>{}); await wait(2500)
  await page.getByRole('button', { name: 'Products' }).first().click(); await wait(1500)
  await page.screenshot({ path: 'docs/training-guide/img/50-inventory.png' }); log('captured inventory list')
  // open Adjust on the first product
  await page.locator('button[title="Adjust stock"]').first().click(); await wait(800)
  await page.screenshot({ path: 'docs/training-guide/img/51-adjust.png' }); log('captured adjust modal')
  // close, open History
  await page.keyboard.press('Escape').catch(()=>{}); await page.mouse.click(20,20).catch(()=>{}); await wait(500)
  await page.locator('td button[title="Stock history"]').first().click().catch(()=>{}); await wait(800)
  await page.screenshot({ path: 'docs/training-guide/img/52-history.png' }); log('captured history modal')
  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0,8).forEach(e=>log('  - '+e))
  log('DONE')
} catch (e) { console.error('UI QA ERROR:', e.message) } finally { await app.close() }
