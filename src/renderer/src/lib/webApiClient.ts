/**
 * Web API client — calls the Express backend when running in a browser (not Electron).
 * Used by the Netlify-deployed frontend talking to the Railway-deployed backend.
 */

import type { PrintableReceipt } from '../../../shared/types'
import { printReceiptInBrowser } from './receipt'

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

async function json<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data as T
}

let sessionUser: any = null
// Held in memory only (a page reload forces re-login on web). Sent with each
// cashier-management call so the SERVER re-verifies the admin's PIN — PINs are
// never exposed on the public API without valid admin credentials.
let adminCreds: { username: string; pin: string } | null = null

export const webApi = {
  // Auth
  login: async (username: string, pin: string) => {
    const user = await json<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin })
    })
    sessionUser = user
    adminCreds = user && (user.role === 'admin' || user.role === 'manager') ? { username, pin } : null
    return user
  },
  logout: async () => { sessionUser = null; adminCreds = null },
  getCurrentUser: async () => sessionUser,

  // Admin cashier management — every call re-authenticates the admin server-side
  listUsers: async () => {
    if (!adminCreds) throw new Error('Sign in as an admin to manage cashiers.')
    return json<any[]>('/api/admin/users', { method: 'POST', body: JSON.stringify(adminCreds) })
  },
  setUserPin: async (userId: string, newPin: string) => {
    if (!adminCreds) return { ok: false, error: 'Sign in as an admin to manage cashiers.' }
    return json<any>('/api/admin/users/setpin', { method: 'POST', body: JSON.stringify({ ...adminCreds, targetId: userId, newPin }) })
  },
  createCashier: async (username: string, displayName: string, pin: string) => {
    if (!adminCreds) return { ok: false, error: 'Sign in as an admin to manage cashiers.' }
    return json<any>('/api/admin/users/create', { method: 'POST', body: JSON.stringify({ ...adminCreds, newUsername: username, displayName, newPin: pin }) })
  },
  renameUser: async (userId: string, displayName: string) => {
    if (!adminCreds) return { ok: false, error: 'Sign in as an admin to manage cashiers.' }
    return json<any>('/api/admin/users/rename', { method: 'POST', body: JSON.stringify({ ...adminCreds, targetId: userId, displayName }) })
  },

  // Products
  getProductByBarcode: async (barcode: string) =>
    json<any>(`/api/products/barcode/${encodeURIComponent(barcode)}`),
  searchProducts: async (query: string) =>
    json<any[]>(`/api/products/search?q=${encodeURIComponent(query)}`),
  getAllProducts: async (page = 1, limit = 50) =>
    json<any>(`/api/products?page=${page}&limit=${limit}`),
  createProduct: async (product: any) =>
    json<any>('/api/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: async (product: any) =>
    json<any>(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(product) }),
  deleteProduct: async (id: string) =>
    json<any>(`/api/products/${id}`, { method: 'DELETE' }),

  // Sales
  completeSale: async (sale: any) =>
    json<any>('/api/sales', { method: 'POST', body: JSON.stringify(sale) }),
  exportDailySales: async (date: string) => {
    const res = await fetch(`${API_URL}/api/sales/export?date=${encodeURIComponent(date)}`)
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Ariemmas_Sales_${date}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return `Ariemmas_Sales_${date}.xlsx`
  },
  getDailySales: async (date: string) =>
    json<any>(`/api/sales/daily?date=${encodeURIComponent(date)}`),

  // Categories
  getCategories: async () => json<any[]>('/api/categories'),

  // Shifts
  openShift: async (userId: string, openingCash: number, cashierName?: string) =>
    json<any>('/api/shifts/open', { method: 'POST', body: JSON.stringify({ userId, openingCash, cashierName }) }),
  closeShift: async (shiftId: string, closingCash: number, notes?: string) =>
    json<any>('/api/shifts/close', { method: 'POST', body: JSON.stringify({ shiftId, closingCash, notes }) }),
  getCurrentShift: async (userId: string) =>
    json<any>(`/api/shifts/current/${encodeURIComponent(userId)}`),

  // Inventory management
  adjustStock: async (productId: string, newQuantity: number, reason: string, type?: string) =>
    json<any>(`/api/products/${productId}/adjust`, { method: 'POST', body: JSON.stringify({ newQuantity, reason, type, user_id: sessionUser?.id }) }),
  getStockMovements: async (productId?: string, limit = 100) =>
    productId ? json<any[]>(`/api/products/${productId}/movements?limit=${limit}`) : [],
  getInventorySummary: async () => json<any>('/api/inventory/summary'),

  // Settings
  getSettings: async () => json<any>('/api/settings'),
  updateSetting: async (key: string, value: string) =>
    json<any>(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) }),

  // Hardware (not available on web)
  printerStatus: async () => ({ connected: false, name: 'Not available (web version)' }),
  listPrinters: async () => [],
  printReceipt: async (receipt: PrintableReceipt) => printReceiptInBrowser(receipt),
  testPrint: async () => ({ ok: false, error: 'Not available on web version' }),
  openCashDrawer: async () => true
}
