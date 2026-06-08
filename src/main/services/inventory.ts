import { v4 as uuid } from 'uuid'
import { getDb, now } from '../database/connection'
import { queueSync } from './syncService'
import { getTerminalId } from './terminal'
import { getCurrentUser } from './auth'
import type { StockMovement, InventorySummary } from '../../shared/types'

/**
 * Set a product's stock to an absolute count and log the movement. Used for
 * receiving new stock, stock-takes, and corrections. Syncs the new stock to the
 * cloud (so other terminals/web see it) and the movement (for the audit trail).
 */
export async function adjustStock(
  productId: string,
  newQuantity: number,
  reason: string,
  type: 'restock' | 'adjustment' | 'correction' = 'adjustment'
): Promise<{ ok: boolean; error?: string; product?: any }> {
  const db = getDb()
  const product = await db.queryOne<any>('SELECT * FROM products WHERE id = ?', [productId])
  if (!product) return { ok: false, error: 'Product not found.' }

  const target = Number(newQuantity)
  if (!Number.isFinite(target) || target < 0) return { ok: false, error: 'Enter a valid stock quantity (0 or more).' }
  const change = target - (Number(product.stock_quantity) || 0)

  const nowExpr = now(db.engine)
  await db.run(`UPDATE products SET stock_quantity = ?, updated_at = ${nowExpr} WHERE id = ?`, [target, productId])

  const user = getCurrentUser()
  const movId = uuid()
  const terminalId = getTerminalId()
  await db.run(
    'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [movId, productId, type, change, target, reason || null, user?.id || null, terminalId]
  )

  const updated = await db.queryOne<any>('SELECT * FROM products WHERE id = ?', [productId])
  queueSync('update', 'product', productId, updated).catch(() => {})
  queueSync('insert', 'stock_movement', movId, {
    id: movId, product_id: productId, type, quantity_change: change, balance_after: target,
    reason: reason || null, user_id: user?.id || null, terminal_id: terminalId
  }).catch(() => {})

  return { ok: true, product: updated }
}

export async function getStockMovements(productId?: string, limit = 100): Promise<StockMovement[]> {
  const db = getDb()
  if (productId) {
    return db.query<StockMovement>(
      'SELECT m.*, p.name as product_name FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id WHERE m.product_id = ? ORDER BY m.created_at DESC LIMIT ?',
      [productId, limit]
    )
  }
  return db.query<StockMovement>(
    'SELECT m.*, p.name as product_name FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id ORDER BY m.created_at DESC LIMIT ?',
    [limit]
  )
}

export async function getInventorySummary(): Promise<InventorySummary> {
  const db = getDb()
  const row = await db.queryOne<any>(`
    SELECT
      COUNT(*) as items,
      COALESCE(SUM(stock_quantity), 0) as units,
      COALESCE(SUM(CASE WHEN stock_quantity <= min_stock_level AND stock_quantity > 0 THEN 1 ELSE 0 END), 0) as low,
      COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END), 0) as out,
      COALESCE(SUM(stock_quantity * cost_price), 0) as value
    FROM products WHERE active = 1
  `)
  return {
    items: Number(row?.items) || 0,
    units: Number(row?.units) || 0,
    lowStock: Number(row?.low) || 0,
    outOfStock: Number(row?.out) || 0,
    stockValue: Number(row?.value) || 0
  }
}
