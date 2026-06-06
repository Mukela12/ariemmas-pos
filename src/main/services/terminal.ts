import { v4 as uuid } from 'uuid'
import { getDb, now } from '../database/connection'

let cachedTerminalId: string | null = null

export async function ensureTerminalId(): Promise<string> {
  if (cachedTerminalId) return cachedTerminalId
  const db = getDb()
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['terminal_id'])
  const current = row?.value || ''
  if (current) {
    cachedTerminalId = current
    return current
  }
  const fresh = uuid()
  const nowExpr = now(db.engine)
  const existing = await db.queryOne('SELECT key FROM settings WHERE key = ?', ['terminal_id'])
  if (existing) {
    await db.run(`UPDATE settings SET value = ?, updated_at = ${nowExpr} WHERE key = ?`, [fresh, 'terminal_id'])
  } else {
    await db.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ${nowExpr})`, ['terminal_id', fresh])
  }
  cachedTerminalId = fresh
  return fresh
}

export function getTerminalId(): string | null {
  return cachedTerminalId
}
