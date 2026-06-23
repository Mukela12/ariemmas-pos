import { getDb, now } from '../database/connection'
import { net, BrowserWindow } from 'electron'
import { cacheRemoteImage } from './productImages'

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

async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await getDb().queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : fallback
}
async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb()
  const ex = await db.queryOne('SELECT key FROM settings WHERE key = ?', [key])
  if (ex) await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
  else await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
}

let isPulling = false

/**
 * Pull the catalog (products, categories, shared settings, images) DOWN from the
 * cloud so this terminal reflects changes made on the web or other terminals.
 * The cloud is the source of truth for product definitions; stock is pulled too
 * but never overwrites a product that has an un-synced local sale pending (so a
 * pull can't revert a just-rung sale before it reaches the server).
 */
export async function pullCatalog(): Promise<{ changed: number }> {
  if (isPulling || !isOnline()) return { changed: 0 }
  isPulling = true
  const db = getDb()
  try {
    const since = await getSetting('last_catalog_pull', '')
    const url = `${SYNC_API_URL}/api/sync/catalog${since ? `?since=${encodeURIComponent(since)}` : ''}`
    const res = await net.fetch(url)
    if (!res.ok) throw new Error(`Catalog pull failed: ${res.status}`)
    const data: any = await res.json()

    // Products with an un-synced local sale: don't touch their stock this round.
    const pendingSales = await db.query<{ payload: string }>(
      "SELECT payload FROM _sync_queue WHERE entity_type = 'sale' AND status = 'pending'"
    )
    const lockedStock = new Set<string>()
    for (const r of pendingSales) {
      try { for (const it of (JSON.parse(r.payload).items || [])) lockedStock.add(it.product_id) } catch { /* ignore */ }
    }
    // Products with an un-pushed local edit/adjustment: skip entirely so the
    // pull can't revert them before our own change reaches the cloud.
    const pendingProducts = await db.query<{ entity_id: string }>(
      "SELECT entity_id FROM _sync_queue WHERE entity_type = 'product' AND status = 'pending'"
    )
    const pendingPush = new Set(pendingProducts.map((r) => r.entity_id))

    // Categories (upsert by id — stable seed ids on both sides)
    for (const c of data.categories || []) {
      const ex = await db.queryOne('SELECT id FROM categories WHERE id = ?', [c.id])
      if (ex) await db.run('UPDATE categories SET name = ?, description = ?, sort_order = ?, active = ? WHERE id = ?', [c.name, c.description ?? null, c.sort_order ?? 0, c.active ?? 1, c.id])
      else await db.run('INSERT INTO categories (id, name, description, sort_order, active) VALUES (?, ?, ?, ?, ?)', [c.id, c.name, c.description ?? null, c.sort_order ?? 0, c.active ?? 1])
    }

    // Products (match by id, then barcode — mirrors the push reconciliation)
    let changed = 0
    for (const p of data.products || []) {
      let local = await db.queryOne<any>('SELECT * FROM products WHERE id = ?', [p.id])
      if (!local && p.barcode) local = await db.queryOne<any>('SELECT * FROM products WHERE barcode = ?', [p.barcode])

      // Local copy has an un-pushed edit — leave it; our push will reconcile.
      if (local && pendingPush.has(local.id)) continue

      // Adopt the cloud's product id so every terminal + the cloud share ids
      // (needed for sale_items FK + adjust pushes to match server-side). Safe
      // while no local sale references this product yet — i.e. at first pull.
      if (local && local.id !== p.id) {
        const child = await db.queryOne('SELECT id FROM sale_items WHERE product_id = ? LIMIT 1', [local.id])
        if (!child) {
          await db.run('UPDATE stock_movements SET product_id = ? WHERE product_id = ?', [p.id, local.id]).catch(() => {})
          await db.run('UPDATE products SET id = ? WHERE id = ?', [p.id, local.id])
          local.id = p.id
        }
      }

      // Cache a remote (Cloudinary) image for offline use; data URLs render inline.
      let imageFilename = local?.image_filename ?? null
      if (p.image_url && p.image_url.startsWith('http') && p.image_url !== local?.image_url) {
        const fn = await cacheRemoteImage(p.image_url, imageFilename).catch(() => null)
        if (fn) imageFilename = fn
      }

      const keepStock = local && lockedStock.has(local.id)
      const stock = keepStock ? local.stock_quantity : (p.stock_quantity ?? 0)
      const isW = p.is_weighted ? 1 : 0

      // Preserve a locally-set scale PLU when the cloud doesn't carry the field
      // (an older server without the scale_plu column omits it entirely). Adopt
      // the cloud's value only when it actually sends one — present even as null
      // means it was explicitly cleared there.
      const plu = ('scale_plu' in p) ? (p.scale_plu ?? null) : (local?.scale_plu ?? null)
      if (!local) {
        await db.run(
          `INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, scale_plu, image_filename, image_url, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.barcode ?? null, p.name, p.category_id ?? null, p.price, p.cost_price ?? 0, p.vat_rate ?? 0.16, stock, p.min_stock_level ?? 5, p.unit ?? 'each', isW, plu, imageFilename, p.image_url ?? null, p.active ?? 1, p.updated_at ?? null]
        )
        changed++
      } else {
        await db.run(
          `UPDATE products SET barcode = ?, name = ?, category_id = ?, price = ?, cost_price = ?, vat_rate = ?, stock_quantity = ?, min_stock_level = ?, unit = ?, is_weighted = ?, scale_plu = ?, image_filename = ?, image_url = ?, active = ?, updated_at = ? WHERE id = ?`,
          [p.barcode ?? null, p.name, p.category_id ?? null, p.price, p.cost_price ?? 0, p.vat_rate ?? 0.16, stock, p.min_stock_level ?? 5, p.unit ?? 'each', isW, plu, imageFilename, p.image_url ?? null, p.active ?? 1, p.updated_at ?? null, local.id]
        )
        changed++
      }
    }

    // Shared settings (shop info, receipt text, VAT) — never the local-only ones.
    for (const [k, v] of Object.entries(data.settings || {})) {
      await setSetting(k, String(v))
    }

    if (data.serverTime) await setSetting('last_catalog_pull', data.serverTime)

    if (changed > 0) {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('catalog:updated', { changed })
      }
      console.log(`[Sync] Pulled ${changed} catalog change(s) from the cloud`)
    }
    return { changed }
  } finally {
    isPulling = false
  }
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
    case 'stock_movement':
      if (operation === 'insert') return { path: '/api/sync/stock-movements', method: 'POST' }
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

  // NOTE: we deliberately do NOT bulk-push existing products. The cloud is the
  // source of truth for the catalog (it seeds its own products and the admin
  // edits it on the web / a terminal, which queues those edits individually).
  // Re-pushing a terminal's seed products would clobber newer cloud edits with
  // stale local data. Terminals consume the catalog via pullCatalog().

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

  if (unsyncedUsers.length || unsyncedCats.length || unsyncedShifts.length || unsyncedSales.length) {
    console.log(`[Sync] Catch-up: queued ${unsyncedUsers.length} users, ${unsyncedCats.length} categories, ${unsyncedShifts.length} shifts, ${unsyncedSales.length} sales`)
  }
}

/** Start the background sync timer */
export function startSyncService(): void {
  if (syncTimer) return
  console.log(`[Sync] Started — checking every ${SYNC_INTERVAL_MS / 1000}s`)

  // Ensure all local data is queued, then run an initial push + pull
  setTimeout(async () => {
    try {
      await ensureAllDataQueued()
    } catch (err: any) {
      console.error('[Sync] Catch-up error:', err.message)
    }
    await processSyncQueue().catch(() => {})
    pullCatalog().catch((err) => console.error('[Sync] Pull error:', err.message))
  }, 5000)

  syncTimer = setInterval(async () => {
    // Push local changes up first, then pull cloud changes down.
    await processSyncQueue().catch((err) => console.error('[Sync] Push error:', err.message))
    await pullCatalog().catch((err) => console.error('[Sync] Pull error:', err.message))
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
