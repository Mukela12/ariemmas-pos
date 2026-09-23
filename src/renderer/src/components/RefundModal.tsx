import { useState, useEffect, useRef } from 'react'
import { X, Minus, Plus, RotateCcw } from 'lucide-react'
import { formatZMW } from '../lib/currency'
import type { SaleForRefund, RefundableSaleItem } from '../../../shared/types'

const REASONS = ['Damaged', 'Expired', 'Wrong item', 'Customer return']

const round2 = (n: number): number => Math.round(n * 100) / 100
// Weighed lines carry fractional kg; anything else steps in whole units.
const isFractional = (it: RefundableSaleItem): boolean => !Number.isInteger(Number(it.quantity))

interface RefundModalProps {
  receiptNumber: string
  onClose: () => void
  onDone: () => void
}

export function RefundModal({ receiptNumber, onClose, onDone }: RefundModalProps) {
  const [data, setData] = useState<SaleForRefund | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.getSaleForRefund?.(receiptNumber)
      .then((d) => {
        if (cancelled) return
        if (!d) setError(`Sale ${receiptNumber} was not found on this till`)
        else setData(d)
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Could not load the sale') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [receiptNumber])

  const remaining = (it: RefundableSaleItem): number =>
    Math.max(0, Number(it.quantity) - Number(it.refunded_quantity))

  const setQty = (it: RefundableSaleItem, qty: number): void => {
    const capped = Math.min(Math.max(0, qty), remaining(it))
    setQuantities((q) => ({ ...q, [it.id]: capped }))
  }

  const total = round2(
    (data?.items || []).reduce((sum, it) => sum + Number(it.unit_price) * (quantities[it.id] || 0), 0)
  )
  const anySelected = Object.values(quantities).some((q) => q > 0)

  const handleConfirm = async (): Promise<void> => {
    if (!data || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const items = data.items
        .filter((it) => (quantities[it.id] || 0) > 0)
        .map((it) => ({ sale_item_id: it.id, quantity: quantities[it.id] }))
      const refund = await window.api.createRefund!({
        sale_id: data.sale.id, items, reason, restock
      })
      // Print the slip; a printer problem must not undo the recorded refund.
      try {
        const settings = await window.api.getSettings()
        const user = await window.api.getCurrentUser()
        await window.api.printRefund?.({
          refundNumber: refund.refund_number,
          originalReceipt: data.sale.receipt_number,
          shopName: settings.shop_name || 'Ariemmas',
          shopAddress: settings.shop_address || '',
          shopPhone: settings.shop_phone || '',
          shopTpin: settings.shop_tpin || '',
          items: data.items
            .filter((it) => (quantities[it.id] || 0) > 0)
            .map((it) => ({
              name: it.product_name,
              quantity: quantities[it.id],
              unit_price: Number(it.unit_price),
              total: round2(Number(it.unit_price) * quantities[it.id])
            })),
          total,
          reason: reason || null,
          processedBy: user?.display_name || user?.username || '—',
          printedAt: new Date().toISOString()
        })
      } catch { /* slip failed to print — refund is still recorded */ }
      onDone()
    } catch (e: any) {
      setError(e?.message || 'Refund failed')
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-[2px] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4E7]">
          <div className="flex items-center gap-2">
            <RotateCcw size={18} className="text-[#B45309]" />
            <h2 className="text-base font-semibold text-[#18181B]">Refund — receipt {receiptNumber}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-[2px] hover:bg-[#F4F4F5]">
            <X size={18} className="text-[#71717A]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-[#E4E4E7] border-t-[#18181B] rounded-full animate-spin" />
            </div>
          ) : error && !data ? (
            <p className="text-sm text-[#B91C1C]">{error}</p>
          ) : data ? (
            <div className="space-y-4">
              <div className="text-[13px] text-[#71717A]">
                Sale total {formatZMW(Number(data.sale.total))} · paid by{' '}
                {data.sale.payment_method === 'cash' ? 'cash' : data.sale.payment_method === 'mobile_money' ? 'mobile money' : 'split'}
                {data.refunds.length > 0 && (
                  <span className="text-[#B45309]">
                    {' '}· already refunded {formatZMW(data.refunds.reduce((s, r) => s + Number(r.total), 0))}
                  </span>
                )}
              </div>

              <div className="border border-[#E4E4E7] rounded-[2px] divide-y divide-[#F4F4F5]">
                {data.items.map((it) => {
                  const left = remaining(it)
                  const qty = quantities[it.id] || 0
                  return (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#18181B] truncate">{it.product_name}</p>
                        <p className="text-[12px] text-[#71717A] tabular-nums">
                          {Number(it.quantity)} sold at {formatZMW(Number(it.unit_price))}
                          {Number(it.refunded_quantity) > 0 && ` · ${Number(it.refunded_quantity)} already refunded`}
                        </p>
                      </div>
                      {left <= 0 ? (
                        <span className="text-[12px] text-[#A1A1AA]">fully refunded</span>
                      ) : isFractional(it) ? (
                        <button
                          onClick={() => setQty(it, qty > 0 ? 0 : left)}
                          className={`h-9 px-3 text-[13px] font-medium rounded-[2px] border ${
                            qty > 0
                              ? 'bg-[#B45309] text-white border-[#B45309]'
                              : 'border-[#E4E4E7] text-[#52525B] hover:border-[#B45309]'
                          }`}
                        >
                          {qty > 0 ? `Refunding ${qty} kg` : `Refund all (${left} kg)`}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQty(it, qty - 1)} disabled={qty <= 0}
                            className="w-9 h-9 flex items-center justify-center border border-[#E4E4E7] rounded-[2px] disabled:opacity-30 hover:border-[#B45309]">
                            <Minus size={14} />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold tabular-nums">{qty}</span>
                          <button onClick={() => setQty(it, qty + 1)} disabled={qty >= left}
                            className="w-9 h-9 flex items-center justify-center border border-[#E4E4E7] rounded-[2px] disabled:opacity-30 hover:border-[#B45309]">
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">
                        {qty > 0 ? formatZMW(round2(Number(it.unit_price) * qty)) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#71717A] uppercase tracking-[0.05em] mb-2">Reason</p>
                <div className="flex flex-wrap gap-2">
                  {REASONS.map((r) => (
                    <button key={r} onClick={() => setReason(r)}
                      className={`h-9 px-3 text-[13px] rounded-[2px] border ${
                        reason === r ? 'bg-[#18181B] text-white border-[#18181B]' : 'border-[#E4E4E7] text-[#52525B] hover:border-[#18181B]'
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-[#52525B] cursor-pointer">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)}
                  className="w-4 h-4 accent-[#0D9488]" />
                Put the goods back in stock
              </label>

              {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
            </div>
          ) : null}
        </div>

        {data && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[#E4E4E7] bg-[#FAFAFA]">
            <div>
              <p className="text-[11px] text-[#71717A] uppercase tracking-[0.06em]">Refund total</p>
              <p className="text-xl font-bold text-[#18181B] tabular-nums">{formatZMW(total)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="h-11 px-5 border border-[#E4E4E7] text-sm font-medium text-[#52525B] rounded-[2px] hover:bg-white">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={!anySelected || !reason || submitting}
                className="h-11 px-6 bg-[#B45309] text-white text-sm font-semibold rounded-[2px] hover:bg-[#92400E] disabled:opacity-40">
                {submitting ? 'Refunding…' : `Refund ${formatZMW(total)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
