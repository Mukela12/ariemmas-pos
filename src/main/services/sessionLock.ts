import { net } from 'electron'
import { getDb } from '../database/connection'
import { getTerminalId } from './terminal'

const SYNC_API_URL = process.env.SYNC_API_URL || 'https://api-production-b925.up.railway.app'
const REQUEST_TIMEOUT_MS = 4000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

async function getTerminalName(): Promise<string> {
  try {
    const db = getDb()
    const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['terminal_name'])
    return row?.value || 'Terminal'
  } catch {
    return 'Terminal'
  }
}

async function request(path: string, init: RequestInit): Promise<Response | null> {
  if (!net.isOnline()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${SYNC_API_URL}${path}`, { ...init, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface LockCheckResult {
  allowed: boolean
  reason?: string
  otherTerminal?: string
}

/**
 * Before allowing a login, ask the server whether this cashier is already
 * active on a different terminal. Fail-open if the server is unreachable —
 * offline operations must still work; conflicts then surface in admin reports
 * via per-sale terminal_id.
 */
export async function checkCanLogin(userId: string): Promise<LockCheckResult> {
  const terminalId = getTerminalId()
  const res = await request(`/api/sessions/active/${encodeURIComponent(userId)}`, { method: 'GET' })
  if (!res || !res.ok) return { allowed: true } // fail-open (server down / offline / endpoint not deployed yet)
  try {
    const data = await res.json() as { active?: boolean; terminal_id?: string; terminal_name?: string }
    if (data.active && data.terminal_id && data.terminal_id !== terminalId) {
      return { allowed: false, reason: 'already_signed_in', otherTerminal: data.terminal_name || 'another terminal' }
    }
    return { allowed: true }
  } catch {
    return { allowed: true }
  }
}

/** Mark this user/terminal as active on the server, then start a heartbeat. */
export async function markLoggedIn(userId: string): Promise<void> {
  const terminalId = getTerminalId()
  const terminalName = await getTerminalName()
  const body = JSON.stringify({ user_id: userId, terminal_id: terminalId, terminal_name: terminalName })
  await request('/api/sessions/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(async () => {
    const hbBody = JSON.stringify({ user_id: userId, terminal_id: terminalId })
    await request('/api/sessions/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: hbBody })
  }, 4 * 60 * 1000) // 4-minute heartbeat (server TTL is 10 min)
}

export async function markLoggedOut(userId: string): Promise<void> {
  const terminalId = getTerminalId()
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  const body = JSON.stringify({ user_id: userId, terminal_id: terminalId })
  await request('/api/sessions/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}
