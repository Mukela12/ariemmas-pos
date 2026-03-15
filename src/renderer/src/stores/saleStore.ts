import { create } from 'zustand'
import type { CartItem, Product } from '../../../shared/types'

interface SaleState {
  items: CartItem[]
  selectedIndex: number
  addItem: (product: Product) => void
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

  addItem: (product: Product) => {
    const price = Number(product.price)
    const vatRate = Number(product.vat_rate)
    set((state) => {
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
        vat_amount: calcVat(lineTotal, vatRate)
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

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + (item.line_total - item.vat_amount), 0)
  },

  getVatTotal: () => {
    return get().items.reduce((sum, item) => sum + item.vat_amount, 0)
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + item.line_total, 0)
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0)
  }
}))
