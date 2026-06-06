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

// Fixed credentials for Ariemmas install. Admin PIN is written to a credentials
// file in the user's Downloads folder on first run; cashier PINs are shown on
// the login screen so the cashier on shift can sign in directly.
export const ADMIN_PIN = '9012'
const CASHIER_SEED: Array<{ username: string; display_name: string; pin: string }> = [
  { username: 'cashier1', display_name: 'Cashier 1', pin: '1111' },
  { username: 'cashier2', display_name: 'Cashier 2', pin: '2222' },
  { username: 'cashier3', display_name: 'Cashier 3', pin: '3333' },
  { username: 'cashier4', display_name: 'Cashier 4', pin: '4444' },
  { username: 'cashier5', display_name: 'Cashier 5', pin: '5555' }
]

async function upsertUserByUsername(username: string, display_name: string, pin: string, role: 'admin' | 'cashier'): Promise<void> {
  const db = getDb()
  const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE username = ?', [username])
  if (existing) return

  const id = uuid()
  const pinHash = bcrypt.hashSync(pin, 10)
  await db.run(
    'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, username, display_name, pinHash, role]
  )
  queueSync('insert', 'user', id, {
    id, username, display_name, pin_hash: pinHash, role, active: 1
  }).catch(() => {})
}

async function writeAdminCredentialsFile(): Promise<void> {
  try {
    const dir = app.getPath('downloads')
    const file = join(dir, 'ariemmas-admin-credentials.txt')
    const body = `ARIEMMAS POS — ADMIN CREDENTIALS
=================================

Keep this file safe and do NOT share with cashiers.

  Username:  admin
  PIN:       ${ADMIN_PIN}

Admin can: manage products, view reports, manage users/cashiers,
change settings, void sales, and access all areas of the POS.

The five cashier accounts are visible on the login screen so any
cashier on shift can sign in directly. The admin account is hidden
from the login screen for security.

If you need to change the admin PIN later, log in as admin and use
Settings.

Generated at: ${new Date().toISOString()}
`
    await writeFile(file, body, 'utf8')
  } catch (err) {
    console.error('[auth] Could not write admin credentials file:', err)
  }
}

export async function seedDefaultAdmin(): Promise<void> {
  await upsertUserByUsername('admin', 'Administrator', ADMIN_PIN, 'admin')
  for (const c of CASHIER_SEED) {
    await upsertUserByUsername(c.username, c.display_name, c.pin, 'cashier')
  }
  await writeAdminCredentialsFile()
}
