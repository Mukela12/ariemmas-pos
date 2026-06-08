import { create } from 'zustand'
import type { CartItem, Product } from '../../../shared/types'
import { isVatEnabled } from '../lib/taxConfig'

interface SaleState {
  items: CartItem[]
  selectedIndex: number
  addItem: (product: Product, explicitQuantity?: number) => void
  removeItem: (index: number) => void
  updateQuantity: (index: number, quantity: number) => void
  clearSale: () => void
  selectItem: (index: number) => void
  getSubtotal: () => number
  getVatTotal: () => number
  getTotal: () => number
  getItemCount: () => number
}

function calcVat(price: number, vatRate: number): number {
  return price - price / (1 + vatRate)
}

export const useSaleStore = create<SaleState>((set, get) => ({
  items: [],
  selectedIndex: -1,

  addItem: (product: Product, explicitQuantity?: number) => {
    const price = Number(product.price)
    const vatRate = Number(product.vat_rate)
    const isWeighted = !!product.is_weighted
    set((state) => {
      // Weighted items (or any call with an explicit quantity) always create a new line —
      // each weighing is its own transaction line.
      if (explicitQuantity != null || isWeighted) {
        const qty = explicitQuantity ?? 1
        const lineTotal = price * qty
        const newItem: CartItem = {
          product_id: product.id,
          barcode: product.barcode,
          name: isWeighted ? `${product.name} (${qty.toFixed(3)} kg)` : product.name,
          price,
          vat_rate: vatRate,
          quantity: qty,
          line_total: lineTotal,
          vat_amount: calcVat(lineTotal, vatRate),
          is_weighted: isWeighted,
          image_url: product.image_url,
          image_filename: product.image_filename
        }
        return { items: [...state.items, newItem], selectedIndex: state.items.length }
      }

      const existing = state.items.findIndex(i => i.product_id === product.id)
      if (existing >= 0) {
        const updated = [...state.items]
        const item = updated[existing]
        const qty = item.quantity + 1
        const lineTotal = price * qty
        updated[existing] = {
          ...item,
          quantity: qty,
          line_total: lineTotal,
          vat_amount: calcVat(lineTotal, item.vat_rate)
        }
        return { items: updated, selectedIndex: existing }
      }
      const lineTotal = price
      const newItem: CartItem = {
        product_id: product.id,
        barcode: product.barcode,
        name: product.name,
        price,
        vat_rate: vatRate,
        quantity: 1,
        line_total: lineTotal,
        vat_amount: calcVat(lineTotal, vatRate),
        is_weighted: false,
        image_url: product.image_url,
        image_filename: product.image_filename
      }
      return { items: [...state.items, newItem], selectedIndex: state.items.length }
    })
  },

  removeItem: (index: number) => {
    set((state) => ({
      items: state.items.filter((_, i) => i !== index),
      selectedIndex: -1
    }))
  },

  updateQuantity: (index: number, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(index)
      return
    }
    set((state) => {
      const updated = [...state.items]
      const item = updated[index]
      const lineTotal = item.price * quantity
      updated[index] = {
        ...item,
        quantity,
        line_total: lineTotal,
        vat_amount: calcVat(lineTotal, item.vat_rate)
      }
      return { items: updated }
    })
  },

  clearSale: () => set({ items: [], selectedIndex: -1 }),

  selectItem: (index: number) => set({ selectedIndex: index }),

  // When VAT is off, the full price is the subtotal and VAT is zero. The
  // getters gate on isVatEnabled() so toggling VAT updates the breakdown live.
  getSubtotal: () => {
    const items = get().items
    if (!isVatEnabled()) return items.reduce((sum, item) => sum + item.line_total, 0)
    return items.reduce((sum, item) => sum + (item.line_total - item.vat_amount), 0)
  },

  getVatTotal: () => {
    if (!isVatEnabled()) return 0
    return get().items.reduce((sum, item) => sum + item.vat_amount, 0)
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.line_total, 0)
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0)
  }
}))
