import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb, now, dateOf } from './database/connection'
import { login, logout, getCurrentUser, seedDefaultAdmin } from './services/auth'
import { completeSale, getDailySales } from './services/sales'
import { exportDailySalesToExcel } from './services/exportExcel'
import { queueSync, getSyncStatus, processSyncQueue } from './services/syncService'
import { IPC_CHANNELS } from '../shared/constants'

export async function registerIpcHandlers(): Promise<void> {
  await seedDefaultAdmin()
  await seedSampleProducts()

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

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_e, product: any) => {
    const db = getDb()
    const id = uuid()
    await db.run(`
      INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity, min_stock_level, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, product.barcode, product.name, product.category_id, product.price, product.cost_price || 0, product.vat_rate || 0.16, product.stock_quantity || 0, product.min_stock_level || 5, product.unit || 'each'])
    const created = await db.queryOne('SELECT * FROM products WHERE id = ?', [id])
    queueSync('insert', 'product', id, created!).catch(() => {})
    return created
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_e, product: any) => {
    const db = getDb()
    const nowExpr = now(db.engine)
    await db.run(`
      UPDATE products SET barcode = ?, name = ?, category_id = ?, price = ?, cost_price = ?,
        vat_rate = ?, stock_quantity = ?, min_stock_level = ?, unit = ?, updated_at = ${nowExpr}
      WHERE id = ?
    `, [product.barcode, product.name, product.category_id, product.price, product.cost_price || 0,
      product.vat_rate || 0.16, product.stock_quantity || 0, product.min_stock_level || 5,
      product.unit || 'each', product.id])
    const updated = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])
    queueSync('update', 'product', product.id, updated!).catch(() => {})
    return updated
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
  ipcMain.handle(IPC_CHANNELS.SHIFT_OPEN, async (_e, userId: string, openingCash: number) => {
    const db = getDb()
    const id = uuid()
    await db.run(
      'INSERT INTO shifts (id, user_id, opening_cash, status) VALUES (?, ?, ?, ?)',
      [id, userId, openingCash, 'open']
    )
    const shift = await db.queryOne('SELECT * FROM shifts WHERE id = ?', [id])
    queueSync('insert', 'shift', id, shift!).catch(() => {})
    return shift
  })

  ipcMain.handle(IPC_CHANNELS.SHIFT_CLOSE, async (_e, shiftId: string, closingCash: number, notes: string) => {
    const db = getDb()
    const shift = await db.queryOne<any>('SELECT * FROM shifts WHERE id = ?', [shiftId])
    if (!shift) return null

    const expectedCash = shift.opening_cash + (shift.total_sales || 0)
    const variance = closingCash - expectedCash
    const nowExpr = now(db.engine)

    await db.run(`
      UPDATE shifts SET closing_cash = ?, expected_cash = ?, variance = ?, notes = ?,
        status = 'closed', closed_at = ${nowExpr} WHERE id = ?
    `, [closingCash, expectedCash, variance, notes, shiftId])

    const closed = await db.queryOne('SELECT * FROM shifts WHERE id = ?', [shiftId])
    queueSync('update', 'shift', shiftId, closed!).catch(() => {})
    return closed
  })

  ipcMain.handle(IPC_CHANNELS.SHIFT_GET_CURRENT, async (_e, userId: string) => {
    const db = getDb()
    return db.queryOne(
      "SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
      [userId]
    )
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
    const db = getDb()
    const nowExpr = now(db.engine)
    await db.run(`UPDATE settings SET value = ?, updated_at = ${nowExpr} WHERE key = ?`, [value, key])
    queueSync('update', 'setting', key, { key, value }).catch(() => {})
    return true
  })

  // Sync
  ipcMain.handle('sync:status', async () => {
    return getSyncStatus()
  })

  ipcMain.handle('sync:now', async () => {
    return processSyncQueue()
  })

  // Hardware (stubs for dev)
  ipcMain.handle(IPC_CHANNELS.HW_PRINTER_STATUS, () => {
    return { connected: false, name: 'No printer configured' }
  })

  ipcMain.handle(IPC_CHANNELS.HW_PRINT_RECEIPT, (_e, _receipt) => {
    console.log('[DEV] Receipt would print here')
    return true
  })

  ipcMain.handle(IPC_CHANNELS.HW_OPEN_DRAWER, () => {
    console.log('[DEV] Cash drawer would open here')
    return true
  })
}

async function seedSampleProducts(): Promise<void> {
  const db = getDb()
  const existing = await db.queryOne('SELECT id FROM products LIMIT 1')
  if (existing) return

  const products = [
    { barcode: '2324345', name: 'Apples (1kg)', cat: 'cat-groceries', price: 55.89, cost: 40.00, stock: 120 },
    { barcode: '3121338', name: 'T-Bone Steak', cat: 'cat-meat', price: 289.99, cost: 210.00, stock: 25 },
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
    await db.run(`
      INSERT INTO products (id, barcode, name, category_id, price, cost_price, vat_rate, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [uuid(), p.barcode, p.name, p.cat, p.price, p.cost, (p as any).vat ?? 0.16, p.stock])
  }
}
