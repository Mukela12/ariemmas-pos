import { v4 as uuid } from 'uuid'
import dayjs from 'dayjs'
import { getDb, dateOf } from '../database/connection'
import type { CompleteSaleInput, Sale } from '../../shared/types'
import { queueSync } from './syncService'
import { getTerminalId } from './terminal'

async function getNextReceiptNumber(): Promise<string> {
  const db = getDb()
  const today = dayjs().format('YYYYMMDD')

  const stored = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_date'")
  const storedDate = stored?.value || ''

  if (storedDate !== today) {
    await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_counter'", ['0'])
    await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_date'", [today])
    queueSync('update', 'setting', 'receipt_counter', { key: 'receipt_counter', value: '0' }).catch(() => {})
    queueSync('update', 'setting', 'receipt_date', { key: 'receipt_date', value: today }).catch(() => {})
  }

  const counter = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_counter'")
  const nextVal = String(parseInt(counter?.value || '0') + 1)
  await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_counter'", [nextVal])
  queueSync('update', 'setting', 'receipt_counter', { key: 'receipt_counter', value: nextVal }).catch(() => {})

  const num = nextVal.padStart(4, '0')
  return `${today}-${num}`
}

export async function completeSale(input: CompleteSaleInput): Promise<Sale> {
  const db = getDb()

  if (!input.shift_id) {
    throw new Error('Cannot complete sale without an open shift')
  }

  return db.transaction(async () => {
    // Validate stock availability
    for (const item of input.items) {
      const product = await db.queryOne<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', [item.product_id])
      if (product && Number(product.stock_quantity) < item.quantity) {
        throw new Error(`Insufficient stock for ${item.name}: ${product.stock_quantity} available, ${item.quantity} requested`)
      }
    }

    const saleId = uuid()
    const receiptNumber = await getNextReceiptNumber()

    const terminalId = getTerminalId()
    await db.run(`
      INSERT INTO sales (id, receipt_number, user_id, shift_id, subtotal, vat_total, total,
        payment_method, amount_tendered, change_given, mobile_ref, status, terminal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    `, [
      saleId, receiptNumber, input.user_id, input.shift_id,
      input.subtotal, input.vat_total, input.total,
      input.payment_method, input.amount_tendered, input.change_given, input.mobile_ref,
      terminalId
    ])

    for (const item of input.items) {
      await db.run(`
        INSERT INTO sale_items (id, sale_id, product_id, product_name, barcode,
          quantity, unit_price, vat_rate, vat_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuid(), saleId, item.product_id, item.name, item.barcode,
        item.quantity, item.price, item.vat_rate, item.vat_amount, item.line_total
      ])
      await db.run(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
        [item.quantity, item.product_id]
      )
      // Inventory audit: log the stock movement for this sale line.
      const afterRow = await db.queryOne<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', [item.product_id])
      await db.run(
        'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), item.product_id, 'sale', -item.quantity, Number(afterRow?.stock_quantity ?? 0), `Sale ${receiptNumber}`, input.user_id, terminalId]
      )
    }

    if (input.shift_id) {
      await db.run(`
        UPDATE shifts SET
          total_sales = total_sales + ?,
          total_transactions = total_transactions + 1,
          total_vat = total_vat + ?
        WHERE id = ?
      `, [input.total, input.vat_total, input.shift_id])
    }

    await db.run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), input.user_id, 'sale', 'sale', saleId, JSON.stringify({ total: input.total, items: input.items.length })]
    )

    const sale = await db.queryOne<Sale>('SELECT * FROM sales WHERE id = ?', [saleId])

    // Queue for sync to remote server
    const saleItems = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId])
    queueSync('insert', 'sale', saleId, { sale, items: saleItems }).catch(() => {})

    return sale!
  })
}

export async function getDailySales(date: string) {
  const db = getDb()
  const dateExpr = dateOf('created_at', db.engine)
  const saleDateExpr = dateOf('s.created_at', db.engine)

  const summary = await db.queryOne<any>(`
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total), 0) as total_revenue,
      COALESCE(SUM(vat_total), 0) as total_vat,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'mobile_money' THEN total ELSE 0 END), 0) as mobile_sales
    FROM sales
    WHERE ${dateExpr} = ? AND status = 'completed'
  `, [date])

  const itemsRow = await db.queryOne<any>(`
    SELECT COALESCE(SUM(si.quantity), 0) as items_sold
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE ${saleDateExpr} = ? AND s.status = 'completed'
  `, [date])

  // Per-cashier breakdown — group by user_id, prefer the human name typed at
  // shift open over the slot username.
  const byCashier = await db.query<any>(`
    SELECT
      s.user_id,
      u.username,
      u.display_name,
      MAX(sh.cashier_name) as shift_cashier_name,
      COUNT(s.id) as sales_count,
      COALESCE(SUM(s.total), 0) as revenue
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shifts sh ON sh.id = s.shift_id
    WHERE ${saleDateExpr} = ? AND s.status = 'completed'
    GROUP BY s.user_id, u.username, u.display_name
    ORDER BY revenue DESC
  `, [date])

  // Per-terminal breakdown — pulls terminal_name from settings if this terminal
  // is the one running the query, otherwise just shows the short id.
  const byTerminal = await db.query<any>(`
    SELECT
      COALESCE(terminal_id, 'unknown') as terminal_id,
      COUNT(id) as sales_count,
      COALESCE(SUM(total), 0) as revenue
    FROM sales
    WHERE ${dateExpr} = ? AND status = 'completed'
    GROUP BY terminal_id
    ORDER BY revenue DESC
  `, [date])

  // Full transaction list for the day — newest first
  const transactions = await db.query<any>(`
    SELECT
      s.id,
      s.receipt_number,
      s.total,
      s.payment_method,
      s.terminal_id,
      s.created_at,
      u.username,
      u.display_name,
      sh.cashier_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shifts sh ON sh.id = s.shift_id
    WHERE ${saleDateExpr} = ? AND s.status = 'completed'
    ORDER BY s.created_at DESC
  `, [date])

  // Refunds paid out that day (regardless of when the original sale happened).
  const refundDateExpr = dateOf('r.created_at', db.engine)
  const refundSummary = await db.queryOne<any>(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(r.total), 0) as total
    FROM refunds r WHERE ${refundDateExpr} = ?
  `, [date])
  const refundsList = await db.query<any>(`
    SELECT r.*, s.receipt_number as sale_receipt
    FROM refunds r LEFT JOIN sales s ON s.id = r.sale_id
    WHERE ${refundDateExpr} = ?
    ORDER BY r.created_at DESC
  `, [date])

  const totalSales = Number(summary?.total_sales) || 0
  const totalRevenue = Number(summary?.total_revenue) || 0
  const refundTotal = Number(refundSummary?.total) || 0

  return {
    refund_count: Number(refundSummary?.cnt) || 0,
    refund_total: refundTotal,
    net_revenue: totalRevenue - refundTotal,
    refunds: refundsList.map((r: any) => ({
      id: r.id,
      refund_number: r.refund_number,
      sale_receipt: r.sale_receipt,
      total: Number(r.total) || 0,
      reason: r.reason,
      created_at: r.created_at
    })),
    total_sales: totalSales,
    total_revenue: totalRevenue,
    total_vat: Number(summary?.total_vat) || 0,
    items_sold: Number(itemsRow?.items_sold) || 0,
    cash_sales: Number(summary?.cash_sales) || 0,
    mobile_sales: Number(summary?.mobile_sales) || 0,
    average_sale: totalSales > 0 ? totalRevenue / totalSales : 0,
    by_cashier: byCashier.map((row: any) => ({
      user_id: row.user_id,
      username: row.username || '—',
      display_name: row.display_name || row.username || '—',
      shift_cashier_name: row.shift_cashier_name || null,
      sales_count: Number(row.sales_count) || 0,
      revenue: Number(row.revenue) || 0
    })),
    by_terminal: byTerminal.map((row: any) => ({
      terminal_id: row.terminal_id,
      sales_count: Number(row.sales_count) || 0,
      revenue: Number(row.revenue) || 0
    })),
    transactions: transactions.map((row: any) => ({
      id: row.id,
      receipt_number: row.receipt_number,
      total: Number(row.total) || 0,
      payment_method: row.payment_method,
      terminal_id: row.terminal_id,
      created_at: row.created_at,
      username: row.username,
      display_name: row.display_name,
      shift_cashier_name: row.cashier_name
    }))
  }
}
