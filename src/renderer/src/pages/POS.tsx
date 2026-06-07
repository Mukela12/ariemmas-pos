import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Minus, Plus, X, CreditCard, Banknote, ShoppingBag, Scale } from 'lucide-react'
import { useSaleStore } from '../stores/saleStore'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { useScanner } from '../hooks/useScanner'
import { formatZMW, formatStock } from '../lib/currency'
import { productImageSrc } from '../lib/productImage'
import { buildPrintableReceipt } from '../lib/receipt'
import { ThankYouScreen } from '../components/ThankYouScreen'
import { NumberKeypad } from '../components/NumberKeypad'
import type { Product, Category } from '../../../shared/types'

export function POS() {
  const [searchQuery, setSearchQuery] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [activeCat, setActiveCat] = useState<string>('all')
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
    }
  }, [requestAddProduct])

  useScanner({ onScan: handleBarcodeScan, enabled: !showPayment })

  // Load categories + the full product catalogue for the tap-to-add grid.
  const loadCatalogue = useCallback(() => {
    window.api.getCategories().then(setCategories).catch(() => {})
    window.api.getAllProducts(1, 1000).then((r) => setAllProducts(r.products)).catch(() => {})
  }, [])
  useEffect(() => { loadCatalogue() }, [loadCatalogue])

  // Enter on the search box: if it's an exact barcode, add it; else add a lone match.
  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim().length >= 3) {
      const product = await window.api.getProductByBarcode(searchQuery.trim())
      if (product) { requestAddProduct(product); setSearchQuery(''); return }
      const matches = gridProducts
      if (matches.length === 1) { requestAddProduct(matches[0]); setSearchQuery('') }
    }
    if (e.key === 'Escape') setSearchQuery('')
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

  // Products shown in the grid: filtered by active category + live search text.
  const q = searchQuery.trim().toLowerCase()
  const gridProducts = allProducts.filter((p) => {
    const inCat = activeCat === 'all' || p.category_id === activeCat
    const matches = !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
    return inCat && matches
  })

  return (
    <div className="relative flex h-full bg-[#ECECEA]">
      {/* LEFT — product picker: scan-first search + category tabs + tap grid */}
      <div className="flex-1 flex flex-col min-w-0 pb-16">
        {/* Search bar */}
        <div className="px-3 pt-3 pb-2 bg-white border-b border-[#E4E4E7] shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              ref={searchRef}
              data-scanner="true"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Scan barcode, or type / tap a product below"
              className="w-full h-12 pl-11 pr-10 rounded-[3px] bg-[#FAFAFA] border border-[#E4E4E7] text-[15px] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:bg-white focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[2px] flex items-center justify-center text-[#A1A1AA] hover:text-[#52525B] hover:bg-[#F4F4F5]">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-[#E4E4E7] overflow-x-auto shrink-0">
          {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`px-3.5 h-8 rounded-[3px] text-[13px] font-semibold whitespace-nowrap transition-colors ${
                activeCat === c.id
                  ? 'bg-[#0D9488] text-white'
                  : 'bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {gridProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA]">
              <ShoppingBag size={40} strokeWidth={1} className="opacity-30" />
              <p className="text-sm mt-3">{q ? 'No products match' : 'No products in this category'}</p>
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}>
              {gridProducts.map((product) => {
                const src = productImageSrc(product)
                const out = !product.is_weighted && Number(product.stock_quantity) <= 0
                return (
                  <button
                    key={product.id}
                    onClick={() => requestAddProduct(product)}
                    disabled={out}
                    className="group flex flex-col bg-white border border-[#E4E4E7] rounded-[3px] overflow-hidden text-left hover:border-[#0D9488] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:translate-y-px disabled:opacity-45 transition-all"
                  >
                    <div className="aspect-square bg-[#F4F4F5] flex items-center justify-center overflow-hidden relative">
                      {src
                        ? <img src={src} alt="" className="w-full h-full object-cover" />
                        : <ShoppingBag size={26} strokeWidth={1.25} className="text-[#D4D4D8]" />}
                      {product.is_weighted && (
                        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 h-5 rounded-[2px] bg-[#0D9488] text-white text-[10px] font-bold">
                          <Scale size={10} /> /kg
                        </span>
                      )}
                      {out && <span className="absolute inset-0 bg-white/60 flex items-center justify-center text-[11px] font-bold text-[#DC2626] uppercase tracking-wide">Out of stock</span>}
                    </div>
                    <div className="p-2 flex-1 flex flex-col">
                      <p className="text-[12.5px] font-medium text-[#18181B] leading-tight line-clamp-2 min-h-[34px]">{product.name}</p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[14px] font-bold text-[#18181B] tabular-nums">{formatZMW(product.price)}</span>
                        {!product.is_weighted && (
                          <span className="text-[10.5px] text-[#A1A1AA] tabular-nums">{formatStock(product.stock_quantity)} left</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — the single cart */}
      <div className="w-[384px] bg-white border-l border-[#E4E4E7] flex flex-col shrink-0">
        <div className="px-4 h-12 border-b border-[#E4E4E7] flex justify-between items-center shrink-0">
          <span className="text-[15px] font-semibold text-[#18181B]">Current Sale</span>
          <span className="text-xs font-semibold text-[#52525B] bg-[#F4F4F5] px-2 py-1 rounded-[2px] tabular-nums">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 text-[#A1A1AA]">
              <ShoppingBag size={36} strokeWidth={1.25} className="opacity-30" />
              <p className="text-sm mt-3 text-[#71717A]">Cart is empty</p>
              <p className="text-xs mt-1">Scan a barcode or tap a product to start.</p>
            </div>
          ) : (
            items.map((item, index) => (
              <div key={`${item.product_id}-${index}`}
                onClick={() => selectItem(index)}
                className={`flex gap-2.5 px-3 py-2.5 border-b border-[#F4F4F5] cursor-pointer ${selectedIndex === index ? 'bg-[#F0FDFA]' : 'hover:bg-[#FAFAFA]'}`}>
                <div className="w-10 h-10 rounded-[2px] bg-[#F4F4F5] overflow-hidden flex items-center justify-center shrink-0">
                  {(() => {
                    const pr = allProducts.find((p) => p.id === item.product_id)
                    const s = pr ? productImageSrc(pr) : null
                    return s ? <img src={s} alt="" className="w-full h-full object-cover" /> : <ShoppingBag size={16} className="text-[#D4D4D8]" />
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-medium text-[#18181B] leading-tight">{item.name}</p>
                    <button onClick={(e) => { e.stopPropagation(); removeItem(index) }}
                      className="w-6 h-6 -mr-1 -mt-0.5 rounded-[2px] flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#DC2626] shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity - 1) }}
                        className="w-8 h-8 rounded-[2px] border border-[#E4E4E7] bg-white flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5] active:bg-[#E4E4E7]">
                        <Minus size={14} />
                      </button>
                      <span className="w-9 text-center font-bold tabular-nums text-[#18181B] text-[15px]">{item.quantity}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity + 1) }}
                        className="w-8 h-8 rounded-[2px] border border-[#E4E4E7] bg-white flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5] active:bg-[#E4E4E7]">
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-[15px] font-bold text-[#18181B] tabular-nums">{formatZMW(item.line_total)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals + pay — pinned */}
        <div className="border-t border-[#E4E4E7] px-4 pt-3 pb-4 shrink-0">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-[#71717A]">Subtotal</span>
              <span className="text-[#52525B] font-medium tabular-nums">{formatZMW(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-[#71717A]">VAT (16%)</span>
              <span className="text-[#52525B] font-medium tabular-nums">{formatZMW(vatTotal)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-[#E4E4E7]">
              <span className="text-[15px] font-semibold text-[#18181B]">Total</span>
              <span className="text-[30px] font-bold text-[#18181B] tabular-nums tracking-tight leading-none">{formatZMW(total)}</span>
            </div>
          </div>
          <button
            onClick={() => items.length > 0 && currentShift && setShowPayment(true)}
            disabled={items.length === 0 || !currentShift}
            className="btn-pay w-full h-16 mt-3 text-[18px] flex flex-col items-center justify-center leading-tight"
          >
            {!currentShift && items.length > 0
              ? <span className="text-[15px]">Open a shift first</span>
              : <><span className="text-[11px] uppercase tracking-wider opacity-80">F12 · Pay</span><span>{formatZMW(total)}</span></>}
          </button>
          {items.length > 0 && (
            <button onClick={() => clearSale()}
              className="btn-ghost w-full h-9 mt-2 text-[13px]">
              Clear sale (F1)
            </button>
          )}
        </div>
      </div>

      {/* Bottom graphite function bar — real boxy buttons */}
      <div className="graphite absolute bottom-0 left-0 right-[384px] h-16 flex items-stretch px-2 py-2 gap-2">
        {[
          { key: 'F1', label: 'New Sale', onClick: () => clearSale(), disabled: false },
          { key: 'F2', label: 'Search', onClick: () => searchRef.current?.focus(), disabled: false },
          { key: 'F3', label: 'Discount', onClick: () => {}, disabled: true },
          { key: 'F5', label: 'Drawer', onClick: () => window.api?.openCashDrawer?.(), disabled: false },
          { key: 'F8', label: 'Remove', onClick: () => selectedIndex >= 0 && removeItem(selectedIndex), disabled: selectedIndex < 0 },
          { key: 'F12', label: 'Pay', onClick: () => items.length > 0 && currentShift && setShowPayment(true), disabled: items.length === 0 || !currentShift }
        ].map(f => (
          <button key={f.key} onClick={f.onClick} disabled={f.disabled}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-[2px] bg-[var(--color-graphite-key)] border border-[var(--color-graphite-line)] hover:bg-[var(--color-graphite-key-hover)] active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0 transition-colors">
            <span className="text-[11px] font-bold text-[#2DD4BF] leading-none">{f.key}</span>
            <span className="text-[12.5px] font-semibold text-white leading-none">{f.label}</span>
          </button>
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
                cashierName: user?.display_name || 'Cashier',
                cashierPerson: currentShift?.cashier_name || null
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
              loadCatalogue() // refresh grid stock after the sale
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const weight = parseFloat(value) || 0
  const total = weight * Number(product.price)
  const canConfirm = weight > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-[3px] border border-[#E4E4E7] w-full max-w-[380px] mx-4 overflow-y-auto max-h-[96vh] shadow-xl">
        <div className="graphite px-5 py-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Weigh item</h2>
            <p className="text-[12px] text-white/55 mt-0.5">{product.name} &middot; {formatZMW(product.price)} per kg</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-[2px] flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {/* Weight display */}
          <div>
            <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Weight (kg) — from the scale</label>
            <div className="w-full h-14 px-4 rounded-[2px] border border-[#E4E4E7] bg-[#FAFAFA] flex items-center justify-end text-[30px] font-bold tabular-nums text-[#18181B]">
              {value || <span className="text-[#D4D4D8]">0.000</span>}
            </div>
          </div>
          {/* Line total */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-[2px] bg-[#F0FDFA] border border-[#99F6E4]">
            <span className="text-[13px] font-semibold text-[#0D9488]">Line total</span>
            <span className="text-[20px] font-bold text-[#0D9488] tabular-nums">{formatZMW(total)}</span>
          </div>
          {/* Keypad */}
          <NumberKeypad
            value={value}
            onChange={setValue}
            onEnter={() => { if (canConfirm) onConfirm(weight) }}
            enterLabel="ADD"
            enterTone="teal"
            enterDisabled={!canConfirm}
            decimal
            maxLength={7}
          />
        </div>
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
      <div className="w-full max-w-[420px] bg-white rounded-[3px] shadow-xl overflow-y-auto max-h-[96vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header — graphite */}
        <div className="graphite px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-white">Payment</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-[2px] hover:bg-white/10 flex items-center justify-center text-white/55 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="text-center">
            <p className="text-[12px] text-white/55 uppercase tracking-wide">Amount Due</p>
            <p className="text-[34px] font-bold text-white tabular-nums mt-0.5 tracking-tight">{formatZMW(total)}</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[2px]">
            <p className="text-[13px] text-[#DC2626]">{error}</p>
          </div>
        )}

        {/* Method toggle */}
        <div className="px-5 pt-4">
          <div className="flex gap-1 p-1 bg-[#F4F4F5] rounded-[2px]">
            <button onClick={() => setMethod('cash')}
              className={`flex-1 h-9 rounded-[3px] text-[13px] font-semibold flex items-center justify-center gap-1.5 ${
                method === 'cash' ? 'bg-white text-[#18181B] shadow-sm' : 'text-[#71717A]'
              }`}>
              <Banknote size={15} /> Cash
            </button>
            <button onClick={() => setMethod('mobile_money')}
              className={`flex-1 h-9 rounded-[3px] text-[13px] font-semibold flex items-center justify-center gap-1.5 ${
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
                <div className="w-full h-14 px-4 rounded-[2px] border border-[#E4E4E7] bg-[#FAFAFA] flex items-center justify-end gap-1 text-[28px] font-bold text-[#18181B] tabular-nums">
                  <span className="text-[16px] text-[#A1A1AA] font-semibold">K</span>
                  {cashAmount || <span className="text-[#D4D4D8]">0.00</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {quickAmounts.map((amount) => (
                  <button key={amount} onClick={() => setCashAmount(String(amount))}
                    className="flex-1 h-10 rounded-[2px] bg-[#F4F4F5] border border-[#E4E4E7] text-[14px] font-semibold text-[#52525B] tabular-nums hover:bg-[#E4E4E7]">
                    K {amount}
                  </button>
                ))}
              </div>
              {tendered > 0 && (
                <div className={`px-4 py-2.5 rounded-[2px] border ${
                  change >= 0 ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#FEF2F2] border-[#FECACA]'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[13px] font-semibold ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {change >= 0 ? 'Change' : 'Short by'}
                    </span>
                    <span className={`text-[20px] font-bold tabular-nums ${change >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {formatZMW(Math.abs(change))}
                    </span>
                  </div>
                </div>
              )}
              {/* Touch keypad */}
              <NumberKeypad
                value={cashAmount}
                onChange={setCashAmount}
                onEnter={handlePay}
                enterLabel={processing ? '…' : 'PAY'}
                enterTone="pay"
                enterDisabled={!canPay || processing}
                decimal
                maxLength={9}
              />
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Reference Number</label>
                <input type="text" value={mobileRef}
                  onChange={(e) => setMobileRef(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canPay) handlePay() }}
                  placeholder="Enter mobile money reference"
                  className="w-full h-11 px-3 rounded-[2px] border border-[#E4E4E7] text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
                  autoFocus
                />
              </div>
              <button onClick={handlePay} disabled={!canPay || processing}
                className="btn-pay w-full h-12 text-[15px]">
                {processing ? 'Processing…' : 'Confirm Payment'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
