/**
 * Web API client — calls the Express backend when running in a browser (not Electron).
 * Used by the Netlify-deployed frontend talking to the Railway-deployed backend.
 */

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

async function json<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  return res.json()
}

let sessionUser: any = null

export const webApi = {
  // Auth
  login: async (username: string, pin: string) => {
    const user = await json<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin })
    })
    sessionUser = user
    return user
  },
  logout: async () => { sessionUser = null },
  getCurrentUser: async () => sessionUser,

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

  // Sales
  completeSale: async (sale: any) =>
    json<any>('/api/sales', { method: 'POST', body: JSON.stringify(sale) }),
  exportDailySales: async () => {
    alert('Excel export is only available in the desktop app.')
    return null
  },
  getDailySales: async (date: string) =>
    json<any>(`/api/sales/daily?date=${encodeURIComponent(date)}`),

  // Categories
  getCategories: async () => json<any[]>('/api/categories'),

  // Shifts
  openShift: async (userId: string, openingCash: number) =>
    json<any>('/api/shifts/open', { method: 'POST', body: JSON.stringify({ userId, openingCash }) }),
  closeShift: async (shiftId: string, closingCash: number, notes?: string) =>
    json<any>('/api/shifts/close', { method: 'POST', body: JSON.stringify({ shiftId, closingCash, notes }) }),
  getCurrentShift: async (userId: string) =>
    json<any>(`/api/shifts/current/${encodeURIComponent(userId)}`),

  // Settings
  getSettings: async () => json<any>('/api/settings'),
  updateSetting: async (key: string, value: string) =>
    json<any>(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) }),

  // Hardware (not available on web)
  printerStatus: async () => ({ connected: false, name: 'Not available (web version)' }),
  printReceipt: async () => true,
  openCashDrawer: async () => true
}
