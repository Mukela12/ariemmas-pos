import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb, now } from './database/connection'
import { login, logout, getCurrentUser, seedDefaultAdmin, listUsersForAdmin, adminSetUserPin, adminRenameUser, adminCreateCashier } from './services/auth'
import { completeSale, getDailySales } from './services/sales'
import { exportDailySalesToExcel } from './services/exportExcel'
import { queueSync, getSyncStatus, processSyncQueue, pullCatalog } from './services/syncService'
import { adjustStock, getStockMovements, getInventorySummary } from './services/inventory'
import {
  buildReceiptBytes,
  buildTestBytes,
  getDrawerKickBytes,
  listPrinters,
  resolvePrinter,
  sendRaw
} from './services/printer'
import { saveProductImage, deleteProductImage } from './services/productImages'
import productImageMap from './database/product-images.json'
import type { PrintableReceipt } from '../shared/types'
import { IPC_CHANNELS } from '../shared/constants'

const PRODUCT_IMAGES = productImageMap as Record<string, string>

async function getSettingValue(key: string, fallback: string): Promise<string> {
  const db = getDb()
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? fallback
}

// Receipt width depends on the paper loaded on this till: 80mm = 48 chars/line,
// 58mm = 32. Per-till setting (receipt_paper_width), defaults to 80mm.
async function getReceiptLineWidth(): Promise<number> {
  return (await getSettingValue('receipt_paper_width', '80')) === '58' ? 32 : 48
}

async function getCashSalesForShift(shiftId: string): Promise<number> {
  const db = getDb()
  const row = await db.queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE shift_id = ? AND payment_method = ? AND status = ?",
    [shiftId, 'cash', 'completed']
  )
  return Number(row?.total) || 0
}

async function getShiftWithCashStats(shiftId: string) {
  const db = getDb()
  const shift = await db.queryOne<any>(
    `SELECT *,
      COALESCE((
        SELECT SUM(total)
        FROM sales
        WHERE shift_id = shifts.id AND payment_method = ? AND status = ?
      ), 0) as cash_sales
    FROM shifts
    WHERE id = ?`,
    ['cash', 'completed', shiftId]
  )

  if (!shift) return null

  const cashSales = Number(shift.cash_sales) || 0
  return {
    ...shift,
    cash_sales: cashSales,
    cash_in_drawer: Number(shift.opening_cash || 0) + cashSales
  }
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const db = getDb()
  const nowExpr = now(db.engine)
  const existing = await db.queryOne('SELECT key FROM settings WHERE key = ?', [key])

  if (existing) {
    await db.run(`UPDATE settings SET value = ?, updated_at = ${nowExpr} WHERE key = ?`, [value, key])
  } else {
    await db.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ${nowExpr})`, [key, value])
  }
}

export async function registerIpcHandlers(): Promise<void> {
  await seedDefaultAdmin()
  await seedSampleProducts()
  await backfillProductImages()

  // Auth
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, username: string, pin: string) => {
    return login(username, pin)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await logout()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_CURRENT, () => {
    return getCurrentUser()
  })

  // Products
  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_BY_BARCODE, async (_e, barcode: string) => {
    const db = getDb()
    return db.queryOne('SELECT * FROM products WHERE barcode = ? AND active = 1', [barcode])
  })

  // Look up a product by its scale PLU (for scanned label-printing-scale barcodes).
  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_BY_PLU, async (_e, plu: number) => {
    const db = getDb()
    return db.queryOne('SELECT * FROM products WHERE scale_plu = ? AND active = 1', [plu])
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_SEARCH, async (_e, query: string) => {
    const db = getDb()
    return db.query(
      'SELECT * FROM products WHERE (name LIKE ? OR barcode LIKE ?) AND active = 1 ORDER BY name LIMIT 50',
      [`%${query}%`, `%${query}%`]
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_ALL, async (_e, page = 1, limit = 50) => {
    const db = getDb()
    const offset = (page - 1) * limit
    const products = await db.query(
      'SELECT * FROM products WHERE active = 1 ORDER BY name LIMIT ? OFFSET ?',
      [limit, offset]
    )
    const countRow = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE active = 1')
    return { products, total: countRow?.count || 0, page, limit }
  })

  ipcMain.handle(IPC_CHANNELS.IMAGE_SAVE, async (_e, dataBase64: string, originalName?: string) => {
    return saveProductImage(dataBase64, originalName)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_e, product: any) => {
    const db = getDb()
    const id = uuid()
    await db.run(`
      INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit, is_weighted, scale_plu, image_filename, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, product.barcode, product.name, product.category_id, product.price, product.cost_price || 0, product.vat_rate || 0.16, product.stock_quantity || 0, product.min_stock_level || 5, product.unit || 'each', product.is_weighted ? 1 : 0, product.scale_plu || null, product.image_filename || null, product.image_url || null])
    const created = await db.queryOne('SELECT * FROM products WHERE id = ?', [id])
    queueSync('insert', 'product', id, created!).catch(() => {})
    return created
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_e, product: any) => {
    const db = getDb()
    const nowExpr = now(db.engine)
    // if the image changed, remove the old cached file
    if (product.id) {
      const prev = await db.queryOne<{ image_filename: string | null }>('SELECT image_filename FROM products WHERE id = ?', [product.id])
      if (prev?.image_filename && prev.image_filename !== product.image_filename) {
        deleteProductImage(prev.image_filename).catch(() => {})
      }
    }
    await db.run(`
      UPDATE products SET barcode = ?, name = ?, category_id = ?, price = ?, cost_price = ?,
        vat_rate = ?, stock_quantity = ?, min_stock_level = ?, unit = ?, is_weighted = ?,
        scale_plu = ?, image_filename = ?, image_url = ?, updated_at = ${nowExpr}
      WHERE id = ?
    `, [product.barcode, product.name, product.category_id, product.price, product.cost_price || 0,
      product.vat_rate || 0.16, product.stock_quantity || 0, product.min_stock_level || 5,
      product.unit || 'each', product.is_weighted ? 1 : 0, product.scale_plu || null,
      product.image_filename || null, product.image_url || null, product.id])
    const updated = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])
    queueSync('update', 'product', product.id, updated!).catch(() => {})
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, async (_e, id: string) => {
    const db = getDb()
    const nowExpr = now(db.engine)
    const prev = await db.queryOne<{ image_filename: string | null }>('SELECT image_filename FROM products WHERE id = ?', [id])
    if (prev?.image_filename) deleteProductImage(prev.image_filename).catch(() => {})
    // Soft delete — keep the row for sale-history integrity, hide from lists.
    await db.run(`UPDATE products SET active = 0, updated_at = ${nowExpr} WHERE id = ?`, [id])
    const row = await db.queryOne('SELECT * FROM products WHERE id = ?', [id])
    if (row) queueSync('update', 'product', id, row).catch(() => {})
    return true
  })

  // Sales
  ipcMain.handle(IPC_CHANNELS.SALE_COMPLETE, async (_e, input) => {
    return completeSale(input)
  })

  ipcMain.handle(IPC_CHANNELS.SALE_GET_DAILY, async (_e, date: string) => {
    return getDailySales(date)
  })

  ipcMain.handle(IPC_CHANNELS.SALE_EXPORT_DAILY, async (_e, date: string) => {
    return exportDailySalesToExcel(date)
  })

  // Categories
  ipcMain.handle(IPC_CHANNELS.CATEGORY_GET_ALL, async () => {
    const db = getDb()
    return db.query('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order')
  })

  // Shifts
  ipcMain.handle(IPC_CHANNELS.SHIFT_OPEN, async (_e, userId: string, openingCash: number, cashierName?: string) => {
    const limit = parseFloat(await getSettingValue('opening_cash_limit', '1000')) || 1000
    if (openingCash < 0) {
      throw new Error('Opening cash cannot be negative')
    }
    if (openingCash > limit) {
      throw new Error(`Opening cash cannot be more than K ${limit.toFixed(2)}`)
    }

    const db = getDb()
    const id = uuid()
    await db.run(
      'INSERT INTO shifts (id, user_id, cashier_name, opening_cash, status) VALUES (?, ?, ?, ?, ?)',
      [id, userId, (cashierName || '').trim() || null, openingCash, 'open']
    )
    const shift = await getShiftWithCashStats(id)
    queueSync('insert', 'shift', id, shift!).catch(() => {})
    return shift
  })

  ipcMain.handle(IPC_CHANNELS.SHIFT_CLOSE, async (_e, shiftId: string, closingCash: number, notes: string) => {
    const db = getDb()
    const shift = await db.queryOne<any>('SELECT * FROM shifts WHERE id = ?', [shiftId])
    if (!shift) return null

    const cashSales = await getCashSalesForShift(shiftId)
    const expectedCash = Number(shift.opening_cash || 0) + cashSales
    const variance = closingCash - expectedCash
    const nowExpr = now(db.engine)

    await db.run(`
      UPDATE shifts SET closing_cash = ?, expected_cash = ?, variance = ?, notes = ?,
        status = 'closed', closed_at = ${nowExpr} WHERE id = ?
    `, [closingCash, expectedCash, variance, notes, shiftId])

    const closed = await getShiftWithCashStats(shiftId)
    queueSync('update', 'shift', shiftId, closed!).catch(() => {})
    return closed
  })

  ipcMain.handle(IPC_CHANNELS.SHIFT_GET_CURRENT, async (_e, userId: string) => {
    const db = getDb()
    const current = await db.queryOne<{ id: string }>(
      "SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
      [userId]
    )
    if (!current?.id) return null
    return getShiftWithCashStats(current.id)
  })

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    const db = getDb()
    const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }
    return settings
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_e, key: string, value: string) => {
    await upsertSetting(key, value)
    queueSync('update', 'setting', key, { key, value }).catch(() => {})
    return true
  })

  // Users — admin-only cashier management (view current PINs, reset, add, rename)
  const requireAdmin = (): void => {
    if (getCurrentUser()?.role !== 'admin') throw new Error('Admin access required.')
  }
  ipcMain.handle(IPC_CHANNELS.USERS_LIST, async () => {
    requireAdmin()
    return listUsersForAdmin()
  })
  ipcMain.handle(IPC_CHANNELS.USERS_SET_PIN, async (_e, userId: string, newPin: string) => {
    requireAdmin()
    return adminSetUserPin(userId, newPin)
  })
  ipcMain.handle(IPC_CHANNELS.USERS_CREATE, async (_e, username: string, displayName: string, pin: string) => {
    requireAdmin()
    return adminCreateCashier(username, displayName, pin)
  })
  ipcMain.handle(IPC_CHANNELS.USERS_RENAME, async (_e, userId: string, displayName: string) => {
    requireAdmin()
    return adminRenameUser(userId, displayName)
  })

  // Inventory — adjust is admin-only; reads are open to any signed-in user.
  ipcMain.handle(IPC_CHANNELS.INVENTORY_ADJUST, async (_e, productId: string, newQuantity: number, reason: string, type?: 'restock' | 'adjustment' | 'correction') => {
    requireAdmin()
    return adjustStock(productId, newQuantity, reason, type)
  })
  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENTS, async (_e, productId?: string, limit?: number) => {
    return getStockMovements(productId, limit)
  })
  ipcMain.handle(IPC_CHANNELS.INVENTORY_SUMMARY, async () => {
    return getInventorySummary()
  })

  // Sync
  ipcMain.handle('sync:status', async () => {
    return getSyncStatus()
  })

  ipcMain.handle('sync:now', async () => {
    const pushed = await processSyncQueue()
    const pulled = await pullCatalog().catch(() => ({ changed: 0 }))
    return { ...pushed, pulled: pulled.changed }
  })

  // Hardware
  ipcMain.handle(IPC_CHANNELS.HW_LIST_PRINTERS, async () => {
    return listPrinters()
  })

  ipcMain.handle(IPC_CHANNELS.HW_PRINTER_STATUS, async () => {
    const saved = await getSettingValue('printer_name', '')
    const printer = await resolvePrinter(saved)
    if (!printer) return { connected: false, name: 'No printer found' }
    return { connected: true, name: printer.displayName }
  })

  ipcMain.handle(IPC_CHANNELS.HW_PRINT_RECEIPT, async (_e, receipt: PrintableReceipt) => {
    const saved = await getSettingValue('printer_name', '')
    const printer = await resolvePrinter(saved)
    if (!printer) {
      console.error('[printer] No printer available to print receipt')
      return false
    }
    try {
      await sendRaw(printer.name, buildReceiptBytes(receipt, await getReceiptLineWidth()))
      return true
    } catch (err) {
      console.error('[printer] Failed to print receipt:', err)
      return false
    }
  })

  ipcMain.handle(IPC_CHANNELS.HW_TEST_PRINT, async () => {
    const saved = await getSettingValue('printer_name', '')
    const printer = await resolvePrinter(saved)
    if (!printer) return { ok: false, error: 'No printer found' }
    try {
      await sendRaw(printer.name, buildTestBytes(await getReceiptLineWidth()))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.HW_OPEN_DRAWER, async () => {
    const saved = await getSettingValue('printer_name', '')
    const printer = await resolvePrinter(saved)
    if (!printer) {
      console.error('[printer] No printer available to open drawer')
      return false
    }
    try {
      await sendRaw(printer.name, getDrawerKickBytes())
      return true
    } catch (err) {
      console.error('[printer] Failed to open drawer:', err)
      return false
    }
  })
}

// Backfill real product images onto already-seeded products (existing installs
// where seedSampleProducts is skipped because products already exist). Only
// fills rows that have no image yet, matched by name.
async function backfillProductImages(): Promise<void> {
  const db = getDb()
  for (const [name, dataUrl] of Object.entries(PRODUCT_IMAGES)) {
    try {
      const row = await db.queryOne<{ id: string; image_url: string | null }>(
        'SELECT id, image_url FROM products WHERE name = ?', [name]
      )
      if (row && !row.image_url) {
        await db.run('UPDATE products SET image_url = ? WHERE id = ?', [dataUrl, row.id])
      }
    } catch { /* ignore individual failures */ }
  }
}

async function seedSampleProducts(): Promise<void> {
  const db = getDb()
  const existing = await db.queryOne('SELECT id FROM products LIMIT 1')
  if (existing) return

  const products = [
    { barcode: '2324345', name: 'Apples (1kg)', cat: 'cat-groceries', price: 55.89, cost: 40.00, stock: 120 },
    // Sold by weight (butchery) — price is per kg; cashier enters the weight.
    { barcode: '3121338', name: 'T-Bone Steak', cat: 'cat-meat', price: 289.99, cost: 210.00, stock: 25, weighted: true, unit: 'kg' },
    { barcode: '4810234', name: 'Mealie Meal 25kg', cat: 'cat-groceries', price: 85.00, cost: 65.00, stock: 48, vat: 0 },
    { barcode: '5918273', name: 'Cooking Oil 2L', cat: 'cat-groceries', price: 65.00, cost: 48.00, stock: 3, vat: 0 },
    { barcode: '6723891', name: 'Sugar 2kg', cat: 'cat-groceries', price: 45.00, cost: 32.00, stock: 67 },
    { barcode: '7834562', name: 'Bread (White)', cat: 'cat-groceries', price: 25.00, cost: 18.00, stock: 30, vat: 0 },
    { barcode: '8945123', name: 'Coca-Cola 500ml', cat: 'cat-beverages', price: 15.00, cost: 10.00, stock: 200 },
    { barcode: '9056784', name: 'Fanta Orange 500ml', cat: 'cat-beverages', price: 15.00, cost: 10.00, stock: 150 },
    { barcode: '1167345', name: 'Castle Lager 340ml', cat: 'cat-beverages', price: 22.00, cost: 15.00, stock: 100 },
    { barcode: '2278456', name: 'Mosi Lager 340ml', cat: 'cat-beverages', price: 20.00, cost: 13.00, stock: 100 },
    { barcode: '3389567', name: 'Chicken Pieces (1kg)', cat: 'cat-meat', price: 85.00, cost: 60.00, stock: 40 },
    { barcode: '4490678', name: 'Bream Fish (Medium)', cat: 'cat-meat', price: 120.00, cost: 80.00, stock: 15 },
    { barcode: '5501789', name: 'Rice 5kg', cat: 'cat-groceries', price: 95.00, cost: 70.00, stock: 35 },
    { barcode: '6612890', name: 'Tomatoes (1kg)', cat: 'cat-groceries', price: 30.00, cost: 20.00, stock: 50, vat: 0 },
    { barcode: '7723901', name: 'Onions (1kg)', cat: 'cat-groceries', price: 25.00, cost: 15.00, stock: 60, vat: 0 },
    { barcode: '8834012', name: 'Washing Powder 1kg', cat: 'cat-household', price: 55.00, cost: 38.00, stock: 45 },
    { barcode: '9945123', name: 'Bar Soap (3-pack)', cat: 'cat-household', price: 35.00, cost: 22.00, stock: 80 },
    { barcode: '1056234', name: 'Dish Soap 750ml', cat: 'cat-household', price: 28.00, cost: 18.00, stock: 55 },
    { barcode: '2167345', name: 'T-Shirt (Plain)', cat: 'cat-clothing', price: 75.00, cost: 40.00, stock: 30 },
    { barcode: '3278456', name: 'Chitenge Fabric (6yd)', cat: 'cat-clothing', price: 150.00, cost: 90.00, stock: 20 },
    { barcode: '4389567', name: 'Phone Charger USB-C', cat: 'cat-electronics', price: 45.00, cost: 20.00, stock: 25 },
    { barcode: '5490678', name: 'AA Batteries (4pk)', cat: 'cat-electronics', price: 35.00, cost: 18.00, stock: 40 },
    { barcode: '6601789', name: 'Matches (Box)', cat: 'cat-household', price: 5.00, cost: 2.00, stock: 200 },
    { barcode: '7712890', name: 'Candles (Pack of 6)', cat: 'cat-household', price: 18.00, cost: 10.00, stock: 75 },
    { barcode: '8823901', name: 'Milk Powder 500g', cat: 'cat-groceries', price: 68.00, cost: 50.00, stock: 30 },
  ]

  for (const p of products) {
    const id = uuid()
    const vatRate = (p as any).vat ?? 0.16
    const isWeighted = (p as any).weighted ? 1 : 0
    const unit = (p as any).unit ?? 'each'
    const imageUrl = PRODUCT_IMAGES[p.name] || null
    await db.run(`
      INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, unit, is_weighted, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, p.barcode, p.name, p.cat, p.price, p.cost, vatRate, p.stock, unit, isWeighted, imageUrl])
    // NB: do NOT queue seed products for sync. The cloud seeds its own catalog
    // and is the source of truth; pushing local seed rows would overwrite newer
    // cloud edits. The terminal receives the catalog via pullCatalog() instead.
  }
}
