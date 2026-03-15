import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Minus, Plus, X, CreditCard, Banknote, ShoppingBag } from 'lucide-react'
import { useSaleStore } from '../stores/saleStore'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { useScanner } from '../hooks/useScanner'
import { formatZMW } from '../lib/currency'
import type { Product } from '../../../shared/types'

export function POS() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const { items, addItem, removeItem, updateQuantity, selectedIndex, selectItem, clearSale, getSubtotal, getVatTotal, getTotal, getItemCount } = useSaleStore()
  const { user } = useAuthStore()
  const { currentShift } = useShiftStore()

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const product = await window.api.getProductByBarcode(barcode)
    if (product) {
      addItem(product)
      setSearchQuery('')
      setShowSearch(false)
    }
  }, [addItem])

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
    addItem(product)
    setSearchQuery('')
    setSearchResults([])
    setShowSearch(false)
    searchRef.current?.focus()
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.length >= 3) {
      const product = await window.api.getProductByBarcode(searchQuery)
      if (product) {
        addItem(product)
        setSearchQuery('')
        setShowSearch(false)
        return
      }
      const results = await window.api.searchProducts(searchQuery)
      if (results.length === 1) {
        addItem(results[0])
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
      if (e.key === 'F12' && items.length > 0) { e.preventDefault(); setShowPayment(true) }
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
    <div className="relative flex h-full pb-10">
      {/* Left — search + cart table */}
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          <input
            ref={searchRef}
            data-scanner="true"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => searchQuery.length >= 2 && setShowSearch(true)}
            placeholder="Search products or scan barcode..."
            className="w-full h-10 pl-9 pr-16 rounded-md bg-white border border-[#E4E4E7] text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA] bg-[#F4F4F5] rounded border border-[#E4E4E7]">F2</kbd>

          {/* Search dropdown */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md border border-[#E4E4E7] shadow-lg z-50 max-h-[300px] overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSearchSelect(product)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#FAFAFA] text-left border-b border-[#F4F4F5] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#18181B] truncate">{product.name}</p>
                    <p className="text-[11px] text-[#A1A1AA] mt-0.5">{product.barcode || 'No barcode'} &middot; {product.stock_quantity} in stock</p>
                  </div>
                  <span className="text-[13px] font-semibold text-[#18181B] tabular-nums ml-3 shrink-0">{formatZMW(product.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart table */}
        <div className="flex-1 bg-white border border-[#E4E4E7] rounded-md overflow-hidden flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_100px_100px_100px_36px] gap-2 px-3 h-9 items-center bg-[#FAFAFA] border-b border-[#E4E4E7] text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.04em]">
            <span>#</span><span>Item</span><span>Qty</span><span className="text-right">Price</span><span className="text-right">Total</span><span></span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA]">
                <ShoppingBag size={36} strokeWidth={1} className="opacity-40" />
                <p className="text-[13px] mt-2">No items yet</p>
                <p className="text-[11px] text-[#D4D4D8] mt-0.5">Scan a barcode or search to add products</p>
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={`${item.product_id}-${index}`}
                  onClick={() => selectItem(index)}
                  className={`grid grid-cols-[40px_1fr_100px_100px_100px_36px] gap-2 px-3 h-11 items-center border-b border-[#F4F4F5] cursor-pointer text-[13px] ${
                    selectedIndex === index ? 'bg-[#F0FDFA]' : 'hover:bg-[#FAFAFA]'
                  }`}
                >
                  <span className="text-[12px] text-[#A1A1AA]">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-[#18181B] truncate">{item.name}</p>
                    <p className="text-[11px] text-[#A1A1AA]">{item.barcode || ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity - 1) }}
                      className="w-6 h-6 rounded border border-[#E4E4E7] bg-white flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5]">
                      <Minus size={11} />
                    </button>
                    <span className="w-5 text-center font-medium tabular-nums text-[#18181B]">{item.quantity}</span>
                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(index, item.quantity + 1) }}
                      className="w-6 h-6 rounded border border-[#E4E4E7] bg-white flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5]">
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-right text-[#52525B] tabular-nums">{formatZMW(item.price)}</span>
                  <span className="text-right font-semibold text-[#18181B] tabular-nums">{formatZMW(item.line_total)}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeItem(index) }}
                    className="w-6 h-6 rounded flex items-center justify-center text-[#A1A1AA] hover:text-[#DC2626] hover:bg-[#FEF2F2]">
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right — order summary */}
      <div className="w-[320px] bg-white border-l border-[#E4E4E7] flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#F4F4F5] flex justify-between items-center">
          <span className="text-sm font-semibold text-[#18181B]">Order Summary</span>
          <span className="text-[12px] text-[#A1A1AA]">{itemCount} items</span>
        </div>

        {/* Totals — pinned to bottom */}
        <div className="flex-1 flex flex-col justify-end px-4 pb-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-[#71717A]">Subtotal</span>
              <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-[#71717A]">VAT (16%)</span>
              <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(vatTotal)}</span>
            </div>
            <div className="h-px bg-[#E4E4E7] my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold text-[#18181B]">Total</span>
              <span className="text-[24px] font-semibold text-[#18181B] tabular-nums tracking-tight">{formatZMW(total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 space-y-2">
            <button
              onClick={() => items.length > 0 && setShowPayment(true)}
              disabled={items.length === 0}
              className="w-full h-12 rounded-md bg-[#0D9488] text-white text-[15px] font-semibold hover:bg-[#0F766E] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Charge {formatZMW(total)}
            </button>
            {items.length > 0 && (
              <button onClick={() => clearSale()}
                className="w-full h-9 rounded-md border border-[#E4E4E7] text-[13px] text-[#71717A] hover:bg-[#FAFAFA]">
                Clear Sale
              </button>
            )}
          </div>
        </div>
      </div>

      {/* F-key bar */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-white border-t border-[#E4E4E7] flex items-center px-3 gap-1">
        {[
          { key: 'F1', label: 'New' },
          { key: 'F2', label: 'Search' },
          { key: 'F3', label: 'Discount' },
          { key: 'F4', label: 'Customer' },
          { key: 'F5', label: 'Drawer' },
          { key: 'F8', label: 'Remove' },
          { key: 'F12', label: 'Pay' }
        ].map(f => (
          <div key={f.key} className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-[#71717A] rounded hover:bg-[#F4F4F5] cursor-default">
            <kbd className="text-[10px] font-semibold text-[#A1A1AA] bg-[#F4F4F5] px-1.5 py-0.5 rounded border border-[#E4E4E7]">{f.key}</kbd>
            {f.label}
          </div>
        ))}
      </div>

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal
          total={total}
          onClose={() => setShowPayment(false)}
          onComplete={async (paymentMethod, amountTendered, changeGiven, mobileRef) => {
            await window.api.completeSale({
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
            await window.api.openCashDrawer()
            clearSale()
            setShowPayment(false)
          }}
        />
      )}
    </div>
  )
}

function PaymentModal({
  total, onClose, onComplete
}: {
  total: number
  onClose: () => void
  onComplete: (method: 'cash' | 'mobile_money', tendered: number | null, change: number | null, mobileRef: string | null) => void
}) {
  const [method, setMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [mobileRef, setMobileRef] = useState('')
  const cashRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (method === 'cash') cashRef.current?.focus() }, [method])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const tendered = parseFloat(cashAmount) || 0
  const change = tendered - total
  const canPay = method === 'cash' ? tendered >= total : mobileRef.trim().length > 0

  const handlePay = () => {
    if (!canPay) return
    if (method === 'cash') onComplete('cash', tendered, change, null)
    else onComplete('mobile_money', null, null, mobileRef.trim())
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
          <button onClick={handlePay} disabled={!canPay}
            className="w-full h-12 rounded-md bg-[#0D9488] text-white text-[15px] font-semibold hover:bg-[#0F766E] disabled:opacity-30 disabled:cursor-not-allowed">
            {method === 'cash' ? `Pay ${formatZMW(total)}` : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
