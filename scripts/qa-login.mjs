// QA the new login (no credential hints, on-screen keyboards) + new credentials
// + drawer gating, from the real desktop app. Also recaptures 01/02 login shots.
import { _electron as electron } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const IMG = 'docs/training-guide/img'
const log = (m) => console.log(m)
const app = await electron.launch({ args: ['out/main/index.js'] })
const page = await app.firstWindow()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const shot = (n) => page.screenshot({ path: `${IMG}/${n}.png` })
const wait = (ms) => page.waitForTimeout(ms)
const kbKey = (k) => page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: new RegExp(`^${k}$`, 'i') }).first()
const padKey = (d) => page.locator('.grid button', { hasText: new RegExp('^' + d + '$') }).first()

try {
  await wait(4000) // seed + load
  await shot('01-login'); log('01 login (no hints)')

  // Type username on the on-screen keyboard
  await page.getByText(/Tap to enter your username/i).click().catch(() => {})
  await wait(400)
  for (const k of ['c', 'a', 's', 'h', 'i', 'e', 'r', '1']) { await kbKey(k).click().catch(() => {}) }
  await wait(300)
  // Move to PIN (Done) and type the NEW pin 3174
  await page.getByRole('button', { name: /^Done$/ }).click().catch(() => {})
  await wait(400)
  for (const d of ['3', '1', '7', '4']) { await padKey(d).click().catch(() => {}) }
  await wait(300)
  await shot('02-login-filled'); log('02 login filled (keyboard + keypad)')

  // Sign in via the keypad SIGN IN key (scoped to the keypad grid to avoid the form button)
  await page.locator('.grid button', { hasText: /SIGN IN/i }).first().click().catch(() => {})
  await wait(2500)
  const onPos = await page.locator('button:has-text("Search for a product")').first().isVisible().catch(() => false)
  log('cashier1 / 3174 (new PIN) login -> ' + (onPos ? 'OK on POS' : 'FAILED'))

  // F5 Drawer should be disabled before a shift is open
  const f5 = page.locator('button:has-text("F5")').first()
  const f5disabled = await f5.isDisabled().catch(() => null)
  log('F5 Drawer disabled before shift -> ' + f5disabled)
  await shot('qa-login-pos');

  // verify the credentials .txt was written to Downloads
  const credFile = join(homedir(), 'Downloads', 'ariemmas-credentials.txt')
  if (existsSync(credFile)) {
    const txt = readFileSync(credFile, 'utf8')
    log('credentials.txt written. Contains mary admin -> ' + /mary/.test(txt) + '; cashier1 3174 -> ' + /3174/.test(txt))
  } else { log('!! credentials.txt NOT found at ' + credFile) }

  log('CONSOLE ERRORS (' + errors.length + '):'); errors.slice(0, 12).forEach((e) => log('  - ' + e))
  log('DONE')
} catch (err) {
  console.error('LOGIN QA ERROR:', err.message); await shot('zz-login-error').catch(() => {})
} finally { await app.close() }
