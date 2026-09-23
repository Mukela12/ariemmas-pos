import { v4 as uuid } from 'uuid'
import { getDb } from '../database/connection'
import type { CreateRefundInput, Refund, SaleForRefund } from '../../shared/types'
import { queueSync } from './syncService'
import { getTerminalId } from './terminal'

const round2 = (n: number): number => Math.round(n * 100) / 100

async function getRefundedQuantities(saleId: string): Promise<Map<string, number>> {
  const db = getDb()
  const rows = await db.query<{ sale_item_id: string; qty: number }>(`
    SELECT ri.sale_item_id, SUM(ri.quantity) as qty
    FROM refund_items ri
    JOIN refunds r ON r.id = ri.refund_id
    WHERE r.sale_id = ?
    GROUP BY ri.sale_item_id
  `, [saleId])
  return new Map(rows.map((r) => [r.sale_item_id, Number(r.qty) || 0]))
}

/** Find a sale by receipt number (or id) with per-item refunded-so-far totals. */
export async function getSaleForRefund(receiptNumber: string): Promise<SaleForRefund | null> {
  const db = getDb()
  const q = (receiptNumber || '').trim()
  if (!q) return null
  const sale = await db.queryOne<any>('SELECT * FROM sales WHERE receipt_number = ? OR id = ?', [q, q])
  if (!sale) return null
  const items = await db.query<any>('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id])
  const refunds = await db.query<any>('SELECT * FROM refunds WHERE sale_id = ? ORDER BY created_at', [sale.id])
  const refundedBy = await getRefundedQuantities(sale.id)
  return {
    sale,
    items: items.map((it: any) => ({ ...it, refunded_quantity: refundedBy.get(it.id) || 0 })),
    refunds
  }
}

export async function createRefund(input: CreateRefundInput, userId: string): Promise<Refund> {
  const db = getDb()

  return db.transaction(async () => {
    const sale = await db.queryOne<any>('SELECT * FROM sales WHERE id = ?', [input.sale_id])
    if (!sale) throw new Error('Sale not found')

    const saleItems = await db.query<any>('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id])
    const byId = new Map(saleItems.map((s: any) => [s.id, s]))
    const refundedBy = await getRefundedQuantities(sale.id)

    const lines: any[] = []
    let total = 0
    let vatTotal = 0
    for (const req of input.items || []) {
      const qty = Math.round(Number(req.quantity) * 1000) / 1000 // 3dp — matches weighed stock precision
      if (!Number.isFinite(qty) || qty <= 0) continue
      const orig = byId.get(req.sale_item_id)
      if (!orig) throw new Error('Selected item is not on this sale')
      const remaining = Number(orig.quantity) - (refundedBy.get(orig.id) || 0)
      if (qty > remaining + 1e-9) {
        throw new Error(`Only ${remaining} of ${orig.product_name} can still be refunded`)
      }
      const lineTotal = round2(Number(orig.unit_price) * qty)
      const vat = round2(Number(orig.vat_amount) * (qty / Number(orig.quantity)))
      lines.push({
        id: uuid(), sale_item_id: orig.id, product_id: orig.product_id,
        product_name: orig.product_name, quantity: qty,
        unit_price: Number(orig.unit_price), vat_amount: vat, line_total: lineTotal
      })
      total = round2(total + lineTotal)
      vatTotal = round2(vatTotal + vat)
    }
    if (lines.length === 0) throw new Error('Nothing selected to refund')

    const prior = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM refunds WHERE sale_id = ?', [sale.id])
    const refundNumber = `R${(Number(prior?.c) || 0) + 1}-${sale.receipt_number}`
    const refundId = uuid()
    const terminalId = getTerminalId()

    await db.run(`
      INSERT INTO refunds (id, sale_id, refund_number, user_id, shift_id, reason, total, vat_total, restocked, terminal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [refundId, sale.id, refundNumber, userId, null, (input.reason || '').trim() || null, total, vatTotal, input.restock ? 1 : 0, terminalId])

    for (const l of lines) {
      await db.run(`
        INSERT INTO refund_items (id, refund_id, sale_item_id, product_id, product_name, quantity, unit_price, vat_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [l.id, refundId, l.sale_item_id, l.product_id, l.product_name, l.quantity, l.unit_price, l.vat_amount, l.line_total])

      if (input.restock) {
        await db.run('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [l.quantity, l.product_id])
        const after = await db.queryOne<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ?', [l.product_id])
        await db.run(
          'INSERT INTO stock_movements (id, product_id, type, quantity_change, balance_after, reason, user_id, terminal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), l.product_id, 'refund', l.quantity, Number(after?.stock_quantity ?? 0), `Refund ${refundNumber}`, userId, terminalId]
        )
      }
    }

    await db.run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), userId, 'refund', 'refund', refundId,
        JSON.stringify({ sale_id: sale.id, receipt: sale.receipt_number, refund_number: refundNumber, total, items: lines.length, restocked: !!input.restock })]
    )

    const refund = await db.queryOne<Refund>('SELECT * FROM refunds WHERE id = ?', [refundId])
    const items = await db.query('SELECT * FROM refund_items WHERE refund_id = ?', [refundId])
    queueSync('insert', 'refund', refundId, { refund, items }).catch(() => {})
    return refund!
  })
}
