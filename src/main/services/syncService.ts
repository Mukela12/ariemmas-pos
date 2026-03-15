import { getDb, now } from '../database/connection'
import { net } from 'electron'

const SYNC_API_URL = process.env.SYNC_API_URL || 'https://api-production-b925.up.railway.app'
const SYNC_INTERVAL_MS = 30_000 // 30 seconds
const MAX_ATTEMPTS = 5

let syncTimer: ReturnType<typeof setInterval> | null = null
let isSyncing = false

/** Queue a write operation for sync to the remote PostgreSQL server */
export async function queueSync(
  operation: 'insert' | 'update' | 'delete',
  entityType: string,
  entityId: string,
  payload: Record<string, any>
): Promise<void> {
  const db = getDb()
  await db.run(
    `INSERT INTO _sync_queue (operation, entity_type, entity_id, payload)
     VALUES (?, ?, ?, ?)`,
    [operation, entityType, entityId, JSON.stringify(payload)]
  )
}

/** Check if the remote server is reachable */
function isOnline(): boolean {
  return net.isOnline()
}

/** Process all pending items in the sync queue */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing || !isOnline()) return { synced: 0, failed: 0 }

  isSyncing = true
  const db = getDb()
  let synced = 0
  let failed = 0

  try {
    // Process in dependency order: users/categories first, then products, then shifts, then sales
    const pending = await db.query<{
      id: number
      operation: string
      entity_type: string
      entity_id: string
      payload: string
      attempts: number
    }>(
      `SELECT * FROM _sync_queue WHERE status = 'pending' AND attempts < ? ORDER BY
        CASE entity_type
          WHEN 'user' THEN 1
          WHEN 'category' THEN 2
          WHEN 'product' THEN 3
          WHEN 'setting' THEN 4
          WHEN 'shift' THEN 5
          WHEN 'sale' THEN 6
          ELSE 7
        END, id`,
      [MAX_ATTEMPTS]
    )

    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload)
        await syncToRemote(item.operation, item.entity_type, item.entity_id, payload)

        const nowExpr = now(db.engine)
        await db.run(
          `UPDATE _sync_queue SET status = 'synced', synced_at = ${nowExpr} WHERE id = ?`,
          [item.id]
        )
        synced++
      } catch (err: any) {
        failed++
        await db.run(
          `UPDATE _sync_queue SET attempts = attempts + 1, error = ? WHERE id = ?`,
          [err.message || 'Unknown error', item.id]
        )
        // Mark as failed if max attempts reached
        if (item.attempts + 1 >= MAX_ATTEMPTS) {
          await db.run(
            `UPDATE _sync_queue SET status = 'failed' WHERE id = ?`,
            [item.id]
          )
        }
      }
    }
  } finally {
    isSyncing = false
  }

  if (synced > 0) {
    console.log(`[Sync] Synced ${synced} items to remote server`)
  }
  if (failed > 0) {
    console.log(`[Sync] ${failed} items failed to sync`)
  }

  return { synced, failed }
}

/** Send a single operation to the remote server */
async function syncToRemote(
  operation: string,
  entityType: string,
  entityId: string,
  payload: Record<string, any>
): Promise<void> {
  const endpoint = getSyncEndpoint(operation, entityType, entityId)
  if (!endpoint) {
    throw new Error(`No sync endpoint for ${operation} ${entityType}`)
  }

  const res = await fetch(`${SYNC_API_URL}${endpoint.path}`, {
    method: endpoint.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body')
    throw new Error(`Sync failed: ${res.status} ${text}`)
  }
}

/** Map entity types and operations to API endpoints */
function getSyncEndpoint(
  operation: string,
  entityType: string,
  entityId: string
): { path: string; method: string } | null {
  switch (entityType) {
    case 'sale':
      if (operation === 'insert') return { path: '/api/sync/sales', method: 'POST' }
      break
    case 'product':
      if (operation === 'insert') return { path: '/api/sync/products', method: 'POST' }
      if (operation === 'update') return { path: `/api/sync/products/${entityId}`, method: 'PUT' }
      break
    case 'shift':
      if (operation === 'insert') return { path: '/api/sync/shifts', method: 'POST' }
      if (operation === 'update') return { path: `/api/sync/shifts/${entityId}`, method: 'PUT' }
      break
    case 'category':
      if (operation === 'insert') return { path: '/api/sync/categories', method: 'POST' }
      break
    case 'user':
      if (operation === 'insert') return { path: '/api/sync/users', method: 'POST' }
      if (operation === 'update') return { path: `/api/sync/users/${entityId}`, method: 'PUT' }
      break
    case 'setting':
      if (operation === 'update') return { path: `/api/sync/settings/${entityId}`, method: 'PUT' }
      break
  }
  return null
}

/** Ensure all local entities have been queued for sync (catch-up for existing databases) */
async function ensureAllDataQueued(): Promise<void> {
  const db = getDb()

  // Find users that have never been queued
  const unsyncedUsers = await db.query<any>(
    `SELECT * FROM users WHERE id NOT IN (SELECT entity_id FROM _sync_queue WHERE entity_type = 'user')`
  )
  for (const u of unsyncedUsers) {
    await queueSync('insert', 'user', u.id, {
      id: u.id, username: u.username, display_name: u.display_name,
      pin_hash: u.pin_hash, role: u.role, active: u.active
    })
  }

  // Find categories that have never been queued
  const unsyncedCats = await db.query<any>(
    `SELECT * FROM categories WHERE id NOT IN (SELECT entity_id FROM _sync_queue WHERE entity_type = 'category')`
  )
  for (const c of unsyncedCats) {
    await queueSync('insert', 'category', c.id, {
      id: c.id, name: c.name, description: c.description, sort_order: c.sort_order, active: c.active
    })
  }

  // Find products that have never been queued
  const unsyncedProducts = await db.query<any>(
    `SELECT * FROM products WHERE id NOT IN (SELECT entity_id FROM _sync_queue WHERE entity_type = 'product')`
  )
  for (const p of unsyncedProducts) {
    await queueSync('insert', 'product', p.id, p)
  }

  // Find shifts that have never been queued
  const unsyncedShifts = await db.query<any>(
    `SELECT * FROM shifts WHERE id NOT IN (SELECT entity_id FROM _sync_queue WHERE entity_type = 'shift')`
  )
  for (const s of unsyncedShifts) {
    await queueSync('insert', 'shift', s.id, s)
  }

  // Find sales that have never been queued
  const unsyncedSales = await db.query<any>(
    `SELECT * FROM sales WHERE id NOT IN (SELECT entity_id FROM _sync_queue WHERE entity_type = 'sale')`
  )
  for (const sale of unsyncedSales) {
    const items = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id])
    await queueSync('insert', 'sale', sale.id, { sale, items })
  }

  // Reset any failed items back to pending so they get retried
  await db.run(
    `UPDATE _sync_queue SET status = 'pending', attempts = 0, error = NULL WHERE status = 'failed'`
  )

  if (unsyncedUsers.length || unsyncedCats.length || unsyncedProducts.length || unsyncedShifts.length || unsyncedSales.length) {
    console.log(`[Sync] Catch-up: queued ${unsyncedUsers.length} users, ${unsyncedCats.length} categories, ${unsyncedProducts.length} products, ${unsyncedShifts.length} shifts, ${unsyncedSales.length} sales`)
  }
}

/** Start the background sync timer */
export function startSyncService(): void {
  if (syncTimer) return
  console.log(`[Sync] Started — checking every ${SYNC_INTERVAL_MS / 1000}s`)

  // Ensure all local data is queued, then run initial sync
  setTimeout(async () => {
    try {
      await ensureAllDataQueued()
    } catch (err: any) {
      console.error('[Sync] Catch-up error:', err.message)
    }
    processSyncQueue().catch(() => {})
  }, 5000)

  syncTimer = setInterval(() => {
    processSyncQueue().catch((err) => {
      console.error('[Sync] Error:', err.message)
    })
  }, SYNC_INTERVAL_MS)
}

/** Stop the background sync timer */
export function stopSyncService(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
    console.log('[Sync] Stopped')
  }
}

/** Get sync status for the UI */
export async function getSyncStatus(): Promise<{
  pending: number
  failed: number
  lastSynced: string | null
  isOnline: boolean
}> {
  const db = getDb()

  const pendingRow = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM _sync_queue WHERE status = 'pending'`
  )
  const failedRow = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM _sync_queue WHERE status = 'failed'`
  )
  const lastRow = await db.queryOne<{ synced_at: string }>(
    `SELECT synced_at FROM _sync_queue WHERE status = 'synced' ORDER BY synced_at DESC LIMIT 1`
  )

  return {
    pending: pendingRow?.count || 0,
    failed: failedRow?.count || 0,
    lastSynced: lastRow?.synced_at || null,
    isOnline: isOnline()
  }
}
