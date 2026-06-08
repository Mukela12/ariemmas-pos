import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getDb } from '../database/connection'
import { queueSync } from './syncService'
import { checkCanLogin, markLoggedIn, markLoggedOut } from './sessionLock'
import type { User, UserPublic } from '../../shared/types'

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

// Insert the user if new, or reset their PIN/name/role to match this list.
// PINs are only set here (there is no in-app PIN editor), so re-asserting them
// on startup keeps every install on the same known credentials.
async function upsertSeedUser(u: SeedUser): Promise<void> {
  const db = getDb()
  const pinHash = bcrypt.hashSync(u.pin, 10)
  const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE username = ?', [u.username])
  if (!existing) {
    const id = uuid()
    await db.run(
      'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES (?, ?, ?, ?, ?)',
      [id, u.username, u.display_name, pinHash, u.role]
    )
    queueSync('insert', 'user', id, {
      id, username: u.username, display_name: u.display_name, pin_hash: pinHash, role: u.role, active: 1
    }).catch(() => {})
  } else {
    await db.run(
      'UPDATE users SET display_name = ?, pin_hash = ?, role = ?, active = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [u.display_name, pinHash, u.role, existing.id]
    )
  }
}

async function writeCredentialsFile(): Promise<void> {
  try {
    const dir = app.getPath('downloads')
    const file = join(dir, 'ariemmas-credentials.txt')
    const admins = SEED_USERS.filter((u) => u.role === 'admin')
    const cashiers = SEED_USERS.filter((u) => u.role === 'cashier')
    const row = (u: SeedUser) => `  ${u.display_name.padEnd(16)} username: ${u.username.padEnd(10)} PIN: ${u.pin}`
    const body = `ARIEMMAS POS — LOGIN CREDENTIALS
=================================

CONFIDENTIAL. Keep this file safe. Logins are NOT shown on the login
screen — hand each person only their own username and PIN.

ADMINISTRATORS  (full access: products, reports, settings, all areas)
${admins.map(row).join('\n')}

CASHIERS  (till only: sell, take payment, open/close their shift)
${cashiers.map(row).join('\n')}

Notes:
- One cashier login works on one terminal at a time.
- PINs are set by the system. To change them, ask your developer.

Generated at: ${new Date().toISOString()}
`
    await writeFile(file, body, 'utf8')
  } catch (err) {
    console.error('[auth] Could not write credentials file:', err)
  }
}

export async function seedDefaultAdmin(): Promise<void> {
  for (const u of SEED_USERS) {
    await upsertSeedUser(u)
  }
  await writeCredentialsFile()
}
