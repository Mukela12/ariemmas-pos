import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getDb } from '../database/connection'
import { queueSync } from './syncService'
import { checkCanLogin, markLoggedIn, markLoggedOut } from './sessionLock'
import type { User, UserPublic, ManagedUser } from '../../shared/types'

let currentUser: UserPublic | null = null

export function getCurrentUser(): UserPublic | null {
  return currentUser
}

export async function login(username: string, pin: string): Promise<UserPublic | null> {
  const db = getDb()
  const user = await db.queryOne<User>(
    'SELECT * FROM users WHERE username = ? AND active = 1', [username]
  )

  if (!user) return null

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return null
  }

  const valid = bcrypt.compareSync(pin, user.pin_hash)

  if (!valid) {
    const attempts = user.failed_attempts + 1
    if (attempts >= 3) {
      const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await db.run(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
        [attempts, lockUntil, user.id]
      )
    } else {
      await db.run(
        'UPDATE users SET failed_attempts = ? WHERE id = ?',
        [attempts, user.id]
      )
    }
    return null
  }

  // PIN is correct. Before completing the login, check the cross-terminal lock
  // for cashiers (admin is exempt — admin can sign in from anywhere for support).
  if (user.role === 'cashier') {
    const lock = await checkCanLogin(user.id)
    if (!lock.allowed) {
      throw new Error(`This cashier is already signed in on ${lock.otherTerminal}. Sign out there first, or wait a few minutes for the session to expire.`)
    }
  }

  await db.run(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [user.id]
  )

  currentUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    active: user.active
  }

  await db.run(
    'INSERT INTO audit_log (id, user_id, action, details) VALUES (?, ?, ?, ?)',
    [uuid(), user.id, 'login', JSON.stringify({ username })]
  )

  markLoggedIn(user.id).catch(() => {})

  return currentUser
}

export async function logout(): Promise<void> {
  if (currentUser) {
    const db = getDb()
    await db.run(
      'INSERT INTO audit_log (id, user_id, action) VALUES (?, ?, ?)',
      [uuid(), currentUser.id, 'logout']
    )
    markLoggedOut(currentUser.id).catch(() => {})
  }
  currentUser = null
}

// Fixed credentials for the Ariemmas install. Two admins (one is the owner's
// aunt, Mary) and five cashiers with non-obvious PINs. Nothing is shown on the
// login screen — the full list is written to a credentials file in the user's
// Downloads folder so the owner can keep it safe and hand out logins privately.
export const ADMIN_PIN = '9012'

type SeedUser = { username: string; display_name: string; pin: string; role: 'admin' | 'cashier' }
const SEED_USERS: SeedUser[] = [
  { username: 'admin',    display_name: 'Administrator', pin: ADMIN_PIN, role: 'admin' },
  { username: 'mary',     display_name: 'Mary',          pin: '4815',    role: 'admin' },
  { username: 'cashier1', display_name: 'Cashier 1',     pin: '3174',    role: 'cashier' },
  { username: 'cashier2', display_name: 'Cashier 2',     pin: '5926',    role: 'cashier' },
  { username: 'cashier3', display_name: 'Cashier 3',     pin: '8043',    role: 'cashier' },
  { username: 'cashier4', display_name: 'Cashier 4',     pin: '2687',    role: 'cashier' },
  { username: 'cashier5', display_name: 'Cashier 5',     pin: '6351',    role: 'cashier' }
]

// Bump this to force a one-time reset of every login back to SEED_USERS on the
// next launch. Normally it stays put so PINs changed by the admin (in the
// Cashiers screen) survive restarts — the seed only fills in missing users.
const CRED_SEED_VERSION = '1'

async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await getDb().queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : fallback
}
async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb()
  const existing = await db.queryOne('SELECT key FROM settings WHERE key = ?', [key])
  if (existing) await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
  else await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
}

const PIN_RE = /^\d{4,6}$/

async function insertUser(u: SeedUser): Promise<string> {
  const db = getDb()
  const id = uuid()
  const pinHash = bcrypt.hashSync(u.pin, 10)
  await db.run(
    'INSERT INTO users (id, username, display_name, pin_hash, pin_plain, role) VALUES (?, ?, ?, ?, ?, ?)',
    [id, u.username, u.display_name, pinHash, u.pin, u.role]
  )
  queueSync('insert', 'user', id, {
    id, username: u.username, display_name: u.display_name, pin_hash: pinHash, pin_plain: u.pin, role: u.role, active: 1
  }).catch(() => {})
  return id
}

async function resetUser(id: string, u: SeedUser): Promise<void> {
  const db = getDb()
  const pinHash = bcrypt.hashSync(u.pin, 10)
  await db.run(
    'UPDATE users SET display_name = ?, pin_hash = ?, pin_plain = ?, role = ?, active = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [u.display_name, pinHash, u.pin, u.role, id]
  )
  queueSync('update', 'user', id, {
    id, username: u.username, display_name: u.display_name, pin_hash: pinHash, pin_plain: u.pin, role: u.role, active: 1
  }).catch(() => {})
}

// Write/refresh the credentials file from the LIVE database, so it always
// reflects the current logins (including any the admin changed).
async function writeCredentialsFile(): Promise<void> {
  try {
    const rows = await getDb().query<{ username: string; display_name: string; pin_plain: string | null; role: string }>(
      'SELECT username, display_name, pin_plain, role FROM users WHERE active = 1 ORDER BY role DESC, username'
    )
    const fmt = (r: { username: string; display_name: string; pin_plain: string | null }) =>
      `  ${(r.display_name || '').padEnd(16)} username: ${r.username.padEnd(10)} PIN: ${r.pin_plain || '(set in the Cashiers screen)'}`
    const admins = rows.filter((r) => r.role === 'admin')
    const cashiers = rows.filter((r) => r.role === 'cashier')
    const file = join(app.getPath('downloads'), 'ariemmas-credentials.txt')
    const body = `ARIEMMAS POS — LOGIN CREDENTIALS
=================================

CONFIDENTIAL. Keep this file safe. Logins are NOT shown on the login
screen — hand each person only their own username and PIN.

ADMINISTRATORS  (full access: products, reports, settings, all areas)
${admins.map(fmt).join('\n')}

CASHIERS  (till only: sell, take payment, open/close their shift)
${cashiers.map(fmt).join('\n')}

Notes:
- One cashier login works on one terminal at a time.
- An admin can view and change these in the POS under "Cashiers".

Generated at: ${new Date().toISOString()}
`
    await writeFile(file, body, 'utf8')
  } catch (err) {
    console.error('[auth] Could not write credentials file:', err)
  }
}

export async function seedDefaultAdmin(): Promise<void> {
  const db = getDb()
  const forceReset = (await getSetting('cred_seed_version', '0')) !== CRED_SEED_VERSION
  for (const u of SEED_USERS) {
    const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE username = ?', [u.username])
    if (!existing) await insertUser(u)
    else if (forceReset) await resetUser(existing.id, u)
  }
  if (forceReset) await setSetting('cred_seed_version', CRED_SEED_VERSION)
  await writeCredentialsFile()
}

// ---- Admin user management (Cashiers screen). Admin-only, desktop-side. ----

export async function listUsersForAdmin(): Promise<ManagedUser[]> {
  const rows = await getDb().query<{ id: string; username: string; display_name: string; pin_plain: string | null; role: any }>(
    'SELECT id, username, display_name, pin_plain, role FROM users WHERE active = 1 ORDER BY role DESC, username'
  )
  return rows.map((r) => ({ id: r.id, username: r.username, display_name: r.display_name, pin: r.pin_plain, role: r.role }))
}

export async function adminSetUserPin(userId: string, newPin: string): Promise<{ ok: boolean; error?: string }> {
  if (!PIN_RE.test(newPin)) return { ok: false, error: 'PIN must be 4 to 6 digits.' }
  const db = getDb()
  const u = await db.queryOne<{ username: string; display_name: string; role: string }>(
    'SELECT username, display_name, role FROM users WHERE id = ?', [userId]
  )
  if (!u) return { ok: false, error: 'User not found.' }
  const pinHash = bcrypt.hashSync(newPin, 10)
  await db.run(
    'UPDATE users SET pin_hash = ?, pin_plain = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [pinHash, newPin, userId]
  )
  queueSync('update', 'user', userId, {
    id: userId, username: u.username, display_name: u.display_name, pin_hash: pinHash, pin_plain: newPin, role: u.role, active: 1
  }).catch(() => {})
  await writeCredentialsFile()
  return { ok: true }
}

export async function adminRenameUser(userId: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
  const name = displayName.trim()
  if (!name) return { ok: false, error: 'Name cannot be empty.' }
  const db = getDb()
  const u = await db.queryOne<{ username: string; pin_plain: string | null; pin_hash: string; role: string }>(
    'SELECT username, pin_plain, pin_hash, role FROM users WHERE id = ?', [userId]
  )
  if (!u) return { ok: false, error: 'User not found.' }
  await db.run('UPDATE users SET display_name = ? WHERE id = ?', [name, userId])
  queueSync('update', 'user', userId, {
    id: userId, username: u.username, display_name: name, pin_hash: u.pin_hash, pin_plain: u.pin_plain, role: u.role, active: 1
  }).catch(() => {})
  await writeCredentialsFile()
  return { ok: true }
}

export async function adminCreateCashier(username: string, displayName: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const uname = username.trim().toLowerCase()
  const name = displayName.trim()
  if (!/^[a-z0-9]{3,20}$/.test(uname)) return { ok: false, error: 'Username must be 3–20 letters/numbers, no spaces.' }
  if (!name) return { ok: false, error: 'Name cannot be empty.' }
  if (!PIN_RE.test(pin)) return { ok: false, error: 'PIN must be 4 to 6 digits.' }
  const db = getDb()
  const clash = await db.queryOne('SELECT id FROM users WHERE username = ?', [uname])
  if (clash) return { ok: false, error: 'That username is already taken.' }
  await insertUser({ username: uname, display_name: name, pin, role: 'cashier' })
  await writeCredentialsFile()
  return { ok: true }
}
