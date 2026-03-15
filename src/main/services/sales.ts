import { v4 as uuid } from 'uuid'
import dayjs from 'dayjs'
import { getDb, dateOf } from '../database/connection'
import type { CompleteSaleInput, Sale } from '../../shared/types'

async function getNextReceiptNumber(): Promise<string> {
  const db = getDb()
  const today = dayjs().format('YYYYMMDD')

  const stored = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_date'")
  const storedDate = stored?.value || ''

  if (storedDate !== today) {
    await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_counter'", ['0'])
    await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_date'", [today])
  }

  const counter = await db.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_counter'")
  const nextVal = String(parseInt(counter?.value || '0') + 1)
  await db.run("UPDATE settings SET value = ? WHERE key = 'receipt_counter'", [nextVal])

  const num = nextVal.padStart(4, '0')
  return `${today}-${num}`
}

export async function completeSale(input: CompleteSaleInput): Promise<Sale> {
  const db = getDb()

  return db.transaction(async () => {
    const saleId = uuid()
    const receiptNumber = await getNextReceiptNumber()

    await db.run(`
      INSERT INTO sales (id, receipt_number, user_id, shift_id, subtotal, vat_total, total,
        payment_method, amount_tendered, change_given, mobile_ref, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `, [
      saleId, receiptNumber, input.user_id, input.shift_id,
      input.subtotal, input.vat_total, input.total,
      input.payment_method, input.amount_tendered, input.change_given, input.mobile_ref
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
    return sale!
  })
}

export async function getDailySales(date: string) {
  const db = getDb()
  const dateExpr = dateOf('created_at', db.engine)

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
    WHERE ${dateOf('s.created_at', db.engine)} = ? AND s.status = 'completed'
  `, [date])

  const totalSales = Number(summary?.total_sales) || 0
  const totalRevenue = Number(summary?.total_revenue) || 0

  return {
    total_sales: totalSales,
    total_revenue: totalRevenue,
    total_vat: Number(summary?.total_vat) || 0,
    items_sold: Number(itemsRow?.items_sold) || 0,
    cash_sales: Number(summary?.cash_sales) || 0,
    mobile_sales: Number(summary?.mobile_sales) || 0,
    average_sale: totalSales > 0 ? totalRevenue / totalSales : 0
  }
}
