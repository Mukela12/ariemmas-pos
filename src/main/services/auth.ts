import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { getDb } from '../database/connection'
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

  return currentUser
}

export async function logout(): Promise<void> {
  if (currentUser) {
    const db = getDb()
    await db.run(
      'INSERT INTO audit_log (id, user_id, action) VALUES (?, ?, ?)',
      [uuid(), currentUser.id, 'logout']
    )
  }
  currentUser = null
}

export async function seedDefaultAdmin(): Promise<void> {
  const db = getDb()
  const existing = await db.queryOne('SELECT id FROM users LIMIT 1')
  if (existing) return

  const pinHash = bcrypt.hashSync('1234', 10)
  await db.run(
    'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES (?, ?, ?, ?, ?)',
    [uuid(), 'admin', 'Administrator', pinHash, 'admin']
  )

  const maryHash = bcrypt.hashSync('5678', 10)
  await db.run(
    'INSERT INTO users (id, username, display_name, pin_hash, role) VALUES (?, ?, ?, ?, ?)',
    [uuid(), 'mary', 'Mary', maryHash, 'cashier']
  )
}
