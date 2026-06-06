import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Minus, Plus, X, CreditCard, Banknote, ShoppingBag } from 'lucide-react'
import { useSaleStore } from '../stores/saleStore'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { useScanner } from '../hooks/useScanner'
import { formatZMW } from '../lib/currency'
import { buildPrintableReceipt } from '../lib/receipt'
import { ThankYouScreen } from '../components/ThankYouScreen'
import type { Product } from '../../../shared/types'

export function POS() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showThankYou, setShowThankYou] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<{ method: 'cash' | 'mobile_money'; total: number; tendered: number | null; change: number | null } | null>(null)
  const [weighingProduct, setWeighingProduct] = useState<Product | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { items, addItem, removeItem, updateQuantity, selectedIndex, selectItem, clearSale, getSubtotal, getVatTotal, getTotal, getItemCount } = useSaleStore()
  const { user } = useAuthStore()
  const { currentShift, setShift } = useShiftStore()

  const requestAddProduct = useCallback((product: Product) => {
    if (product.is_weighted) {
      setWeighingProduct(product)
    } else {
      addItem(product)
    }
  }, [addItem])

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const product = await window.api.getProductByBarcode(barcode)
    if (product) {
      requestAddProduct(product)
      setSearchQuery('')
      setShowSearch(false)
    }
  }, [requestAddProduct])

  useScanner({ onScan: handleBarcodeScan, enabled: !showPayment })

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (query.length >= 2) {
      const results = await window.api.searchProducts(query)
      setSearchResults(results)
      setShowSearch(true)
    } else {
      setSearchResults([])
      setShowSearch(false)
    }
  }

  const handleSearchSelect = (product: Product) => {
    requestAddProduct(product)
    setSearchQuery('')
    setSearchResults([])
    setShowSearch(false)
    searchRef.current?.focus()
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.length >= 3) {
      const product = await window.api.getProductByBarcode(searchQuery)
      if (product) {
        requestAddProduct(product)
        setSearchQuery('')
        setShowSearch(false)
        return
      }
      const results = await window.api.searchProducts(searchQuery)
      if (results.length === 1) {
        requestAddProduct(results[0])
        setSearchQuery('')
        setShowSearch(false)
      }
    }
    if (e.key === 'Escape') {
      setSearchQuery('')
      setShowSearch(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' && items.length > 0 && currentShift) { e.preventDefault(); setShowPayment(true) }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F8' && selectedIndex >= 0) { e.preventDefault(); removeItem(selectedIndex) }
      if (e.key === 'F1') { e.preventDefault(); clearSale() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items.length, selectedIndex, removeItem, clearSale])

  const total = getTotal()
  const subtotal = getSubtotal()
  const vatTotal = getVatTotal()
  const itemCount = getItemCount()

  return (
    <div className="relative flex h-full bg-[var(--color-surface-alt)]">
      {/* Left — search + cart */}
      <div className="flex-1 flex flex-col p-4 pb-[44px] gap-3 min-w-0">
        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <input
            ref={searchRef}
            data-scanner="true"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => searchQuery.length >= 2 && setShowSearch(true)}
            placeholder="Scan barcode or search products…"
            className="w-full h-12 pl-11 pr-16 rounded-md bg-white border border-[var(--color-border)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-ink-2)] bg-[var(--color-surface-alt)] rounded border border-[var(--color-border)]">F2</kbd>

          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md border border-[var(--color-border)] shadow-lg z-50 max-h-[320px] overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSearchSelect(product)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-alt)] text-left border-b border-[var(--color-border-subtle)] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--color-ink)] truncate">{product.name}</p>
                    <p className="text-[12px] text-[var(--color-ink-3)] mt-0.5 font-mono">{product.barcode || 'no barcode'} · {product.stock_quantity} left</p>
                  </div>
                  <span className="text-[15px] font-bold text-[var(--color-ink)] tabular-nums ml-3 shrink-0">{formatZMW(product.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart — full-bleed list, no duplicate receipt panel */}
        <div className="flex-1 bg-white border border-[var(--color-border)] rounded-md overflow-hidden flex flex-col">
          <div className="grid grid-cols-[44px_1fr_140px_110px_120px_44px] gap-2 px-4 h-9 items-center bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] text-[11px] font-bold text-[var(--color-ink-2)] uppercase">
            <span className="text-center">#</span><span>Item</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span><span></span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--color-ink-4)] gap-2">
                <ShoppingBag size={42} strokeWidth={1.25} className="opacity-30" />
                <p className="text-[15px] font-medium text-[var(--color-ink-3)]">Cart is empty</p>
                <p className="text-[12px]">Scan a barcode or press <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-[var(--color-surface-alt)] rounded border border-[var(--color-border)]">F2</kbd> to search</p>
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={`${item.product_id}-${index}`}
                  onClick={() => selectItem(index)}
                  className={`grid grid-cols-[44px_1fr_140px_110px_120px_44px] gap-2 px-4 min-h-[56px] items-center border-b border-[var(--color-border-subtle)] cursor-pointer text-[14px] ${
                    selectedIndex === index
                      ? 'bg-[var(--color-brand-light)] border-l-[3px] border-l-[var(--color-brand)]'
                      : index % 2 === 1 ? 'bg-[var(--color-surface-alt)]/40 hover:bg-[var(--color-surface-alt)]' : 'hover:bg-[var(--color-surface-alt)]'
                  }`}
                >
                  <span className="text-center text-[12px] text-[var(--color-ink-3)] font-bold tabular-nums">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-ink)] truncate">{item.name}</p>
                    {item.barcode && <p className="text-[11px] text-[var(--color-ink-4)] mt-0.5 font-mono">{item.barcode}</p>}
                  </div>
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity - 1) }}
                      className="w-9 h-9 rounded border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-ink-2)] hover:bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-active)]">
                      <Minus size={14} />
                    </button>
                    <span className="w-10 text-center font-bold tabular-nums text-[var(--color-ink)] text-[16px]">{item.quantity}</span>
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity + 1) }}
                      className="w-9 h-9 rounded border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-ink-2)] hover:bg-[var(--color-surface-alt)] active:bg-[var(--color-surface-active)]">
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="text-right text-[var(--color-ink-2)] tabular-nums">{formatZMW(item.price)}</span>
                  <span className="text-right font-bold text-[var(--color-ink)] tabular-nums text-[15px]">{formatZMW(item.line_total)}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeItem(index) }}
                    className="w-9 h-9 rounded flex items-center justify-center text-[var(--color-ink-4)] hover:text-white hover:bg-[var(--color-error)]">
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right — dominant totals panel */}
      <div className="w-[360px] bg-[var(--color-surface-deep)] flex flex-col shrink-0 text-white">
        {/* Item counter strip */}
        <div className="px-5 py-3 border-b border-white/[0.08] flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Current sale</span>
          <span className="text-[13px] text-white/80 tabular-nums font-medium">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        </div>

        {/* Subtotal / VAT — quiet */}
        <div className="px-5 py-4 space-y-2 border-b border-white/[0.08]">
          <div className="flex justify-between text-[13px]">
            <span className="text-white/60">Subtotal</span>
            <span className="text-white/90 font-medium tabular-nums">{formatZMW(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-white/60">VAT (16%)</span>
            <span className="text-white/90 font-medium tabular-nums">{formatZMW(vatTotal)}</span>
          </div>
        </div>

        {/* TOTAL — dominant */}
        <div className="flex-1 px-5 py-6 flex flex-col justify-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">Amount due</div>
          <div className="text-[56px] font-bold tabular-nums tracking-tight leading-none">
            {formatZMW(total)}
          </div>
        </div>

        {/* PAY */}
        <div className="px-4 pb-4 pt-2 bg-black/20 space-y-2">
          <button
            onClick={() => items.length > 0 && currentShift && setShowPayment(true)}
            disabled={items.length === 0 || !currentShift}
            className="btn-pay"
          >
            {!currentShift && items.length > 0 ? (
              <span className="text-[16px]">Open a shift first</span>
            ) : (
              <>
                <span className="text-[12px] uppercase tracking-wider opacity-80 leading-none mb-1">F12 · Pay now</span>
                <span className="text-[26px] tabular-nums leading-none">{formatZMW(total)}</span>
              </>
            )}
          </button>
          {items.length > 0 && (
            <button onClick={() => clearSale()}
              className="w-full h-9 rounded text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
              Clear sale (F1)
            </button>
          )}
        </div>
      </div>

      {/* F-key bar */}
      <div className="absolute bottom-0 left-0 right-[360px] h-9 bg-[var(--color-surface-deep)] flex items-center px-3 gap-0.5">
        {[
          { key: 'F1', label: 'Clear' },
          { key: 'F2', label: 'Search' },
          { key: 'F3', label: 'Discount' },
          { key: 'F5', label: 'Drawer' },
          { key: 'F8', label: 'Remove' },
          { key: 'F12', label: 'Pay' }
        ].map(f => (
          <div key={f.key} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-white/60 cursor-default">
            <kbd className="text-[10px] font-bold text-white bg-white/10 px-1.5 py-0.5 rounded">{f.key}</kbd>
            <span className="font-medium">{f.label}</span>
          </div>
        ))}
      </div>

      {/* Thank you screen */}
      {showThankYou && (
        <ThankYouScreen
          onClose={() => { setShowThankYou(false); setLastPayment(null) }}
          paymentMethod={lastPayment?.method}
          total={lastPayment?.total}
          amountTendered={lastPayment?.tendered}
          changeGiven={lastPayment?.change}
        />
      )}

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal
          total={total}
          error={paymentError}
          onClose={() => { setShowPayment(false); setPaymentError(null) }}
          onComplete={async (paymentMethod, amountTendered, changeGiven, mobileRef) => {
            try {
              setPaymentError(null)
              const saleItems = items.map((item) => ({ ...item }))
              const completedSale = await window.api.completeSale({
                items,
                subtotal,
                vat_total: vatTotal,
                total,
                payment_method: paymentMethod,
                amount_tendered: amountTendered,
                change_given: changeGiven,
                mobile_ref: mobileRef,
                user_id: user!.id,
                shift_id: currentShift?.id || null
              })
              const settings = await window.api.getSettings().catch(() => ({}))
              const receipt = buildPrintableReceipt({
                sale: completedSale,
                items: saleItems,
                settings,
                cashierName: user?.display_name || 'Cashier'
              })

              try { await window.api.printReceipt(receipt) } catch {}
              if (paymentMethod === 'cash') {
                try { await window.api.openCashDrawer() } catch {}
              }

              if (user?.id) {
                try {
                  const updatedShift = await window.api.getCurrentShift(user.id)
                  setShift(updatedShift)
                } catch {}
              }

              setLastPayment({ method: paymentMethod, total, tendered: amountTendered, change: changeGiven })
              clearSale()
              setShowPayment(false)
              setShowThankYou(true)
            } catch (err: any) {
              console.error('Payment failed:', err)
              setPaymentError(err?.message || 'Payment failed. Please try again.')
            }
          }}
        />
      )}

      {/* Weight entry modal for butchery / by-kg items */}
      {weighingProduct && (
        <WeightModal
          product={weighingProduct}
          onCancel={() => setWeighingProduct(null)}
          onConfirm={(weight) => {
            addItem(weighingProduct, weight)
            setWeighingProduct(null)
          }}
        />
      )}
    </div>
  )
}

function WeightModal({
  product, onConfirm, onCancel
}: {
  product: Product
  onConfirm: (weight: number) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const weight = parseFloat(value) || 0
  const total = weight * Number(product.price)
  const canConfirm = weight > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg border border-[#E4E4E7] w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4E4E7]">
          <h2 className="text-base font-semibold text-[#18181B]">Weigh item</h2>
          <p className="text-[13px] text-[#71717A] mt-0.5">{product.name} &middot; {formatZMW(product.price)} per kg</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (canConfirm) onConfirm(weight) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Weight (kg)</label>
            <input
              ref={inputRef}
              type="number"
              step="0.001"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.000"
              className="w-full h-12 px-3 rounded-md border border-[#E4E4E7] bg-white text-2xl font-semibold tabular-nums text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
            />
            <p className="text-[11px] text-[#71717A] mt-1.5">Type the weight from the scale (kg). Decimals allowed (e.g. 0.450).</p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md bg-[#F4F4F5] border border-[#E4E4E7]">
            <span className="text-sm font-medium text-[#71717A]">Line total</span>
            <span className="text-lg font-semibold text-[#18181B] tabular-nums">{formatZMW(total)}</span>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel}
              className="h-10 px-4 text-sm font-medium text-[#52525B] hover:bg-[#F4F4F5] rounded-md">
              Cancel
            </button>
            <button type="submit" disabled={!canConfirm}
              className="h-10 px-5 bg-[#0D9488] text-white text-sm font-medium rounded-md hover:bg-[#0F766E] disabled:opacity-40 disabled:cursor-not-allowed">
              Add to cart
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({
  total, onClose, onComplete, error
}: {
  total: number
  error: string | null
  onClose: () => void
  onComplete: (method: 'cash' | 'mobile_money', tendered: number | null, change: number | null, mobileRef: string | null) => void
}) {
  const [method, setMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [mobileRef, setMobileRef] = useState('')
  const [processing, setProcessing] = useState(false)
  const cashRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (method === 'cash') cashRef.current?.focus() }, [method])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !processing) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, processing])

  const tendered = parseFloat(cashAmount) || 0
  const change = tendered - total
  const canPay = method === 'cash' ? tendered >= total : mobileRef.trim().length > 0

  const handlePay = async () => {
    if (!canPay || processing) return
    setProcessing(true)
    if (method === 'cash') await onComplete('cash', tendered, change, null)
    else await onComplete('mobile_money', null, null, mobileRef.trim())
    setProcessing(false)
  }

  const quickAmounts = [
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 500) * 500
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-[420px] bg-white rounded-lg shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E4E7]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[#18181B]">Payment</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-[#F4F4F5] flex items-center justify-center text-[#A1A1AA]">
              <X size={16} />
            </button>
          </div>
          <div className="text-center">
            <p className="text-[12px] text-[#71717A]">Amount Due</p>
            <p className="text-[32px] font-semibold text-[#18181B] tabular-nums mt-0.5 tracking-tight">{formatZMW(total)}</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-md">
            <p className="text-[13px] text-[#DC2626]">{error}</p>
          </div>
        )}

        {/* Method toggle */}
        <div className="px-5 pt-4">
          <div className="flex gap-1 p-1 bg-[#F4F4F5] rounded-md">
            <button onClick={() => setMethod('cash')}
              className={`flex-1 h-9 rounded text-[13px] font-medium flex items-center justify-center gap-1.5 ${
                method === 'cash' ? 'bg-white text-[#18181B] shadow-sm' : 'text-[#71717A]'
              }`}>
              <Banknote size={15} /> Cash
            </button>
            <button onClick={() => setMethod('mobile_money')}
              className={`flex-1 h-9 rounded text-[13px] font-medium flex items-center justify-center gap-1.5 ${
                method === 'mobile_money' ? 'bg-white text-[#18181B] shadow-sm' : 'text-[#71717A]'
              }`}>
              <CreditCard size={15} /> Mobile Money
            </button>
          </div>
        </div>

        {/* Input */}
        <div className="px-5 py-4 space-y-3">
          {method === 'cash' ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Cash Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-[#A1A1AA]">K</span>
                  <input ref={cashRef} type="number" value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canPay) handlePay() }}
                    placeholder="0.00" step="0.01"
                    className="w-full h-12 pl-8 pr-3 rounded-md border border-[#E4E4E7] text-xl font-semibold text-[#18181B] tabular-nums placeholder:text-[#D4D4D8] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {quickAmounts.map((amount) => (
                  <button key={amount} onClick={() => setCashAmount(String(amount))}
                    className="flex-1 h-9 rounded-md bg-[#F4F4F5] border border-[#E4E4E7] text-[13px] font-medium text-[#52525B] tabular-nums hover:bg-[#E4E4E7]">
                    K {amount}
                  </button>
                ))}
              </div>
              {tendered > 0 && (
                <div className={`p-3 rounded-md border ${
                  change >= 0 ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#FEF2F2] border-[#FECACA]'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[13px] font-medium ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {change >= 0 ? 'Change' : 'Short by'}
                    </span>
                    <span className={`text-lg font-semibold tabular-nums ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {formatZMW(Math.abs(change))}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Reference Number</label>
              <input type="text" value={mobileRef}
                onChange={(e) => setMobileRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canPay) handlePay() }}
                placeholder="Enter mobile money reference"
                className="w-full h-10 px-3 rounded-md border border-[#E4E4E7] text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Pay button */}
        <div className="px-5 pb-5">
          <button onClick={handlePay} disabled={!canPay || processing}
            className="w-full h-12 rounded-md bg-[#0D9488] text-white text-[15px] font-semibold hover:bg-[#0F766E] disabled:opacity-30 disabled:cursor-not-allowed">
            {processing ? 'Processing...' : method === 'cash' ? `Pay ${formatZMW(total)}` : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
