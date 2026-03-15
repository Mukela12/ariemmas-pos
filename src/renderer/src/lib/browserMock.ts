/**
 * Mock window.api for browser preview (non-Electron environment).
 * Only active when window.api is not provided by the Electron preload.
 */

const MOCK_USERS = [
  { id: 'u1', username: 'admin', display_name: 'Admin User', role: 'admin' as const, active: 1, pin: '1234' },
  { id: 'u2', username: 'mary', display_name: 'Mary Banda', role: 'cashier' as const, active: 1, pin: '5678' }
]

const MOCK_CATEGORIES = [
  { id: 'cat-groceries', name: 'Groceries', description: null, sort_order: 1, active: 1, created_at: '' },
  { id: 'cat-meat', name: 'Meat & Fish', description: null, sort_order: 2, active: 1, created_at: '' },
  { id: 'cat-beverages', name: 'Beverages', description: null, sort_order: 3, active: 1, created_at: '' },
  { id: 'cat-household', name: 'Household', description: null, sort_order: 4, active: 1, created_at: '' },
  { id: 'cat-clothing', name: 'Clothing', description: null, sort_order: 5, active: 1, created_at: '' },
  { id: 'cat-electronics', name: 'Electronics', description: null, sort_order: 6, active: 1, created_at: '' }
]

const MOCK_PRODUCTS = [
  { id: 'p1', barcode: '2324345', name: 'Apples (1kg)', category_id: 'cat-groceries', price: 55.89, cost_price: 40.00, vat_rate: 0.16, stock_quantity: 120, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p2', barcode: '3121338', name: 'T-Bone Steak', category_id: 'cat-meat', price: 289.99, cost_price: 210.00, vat_rate: 0.16, stock_quantity: 25, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p3', barcode: '4810234', name: 'Mealie Meal 25kg', category_id: 'cat-groceries', price: 85.00, cost_price: 65.00, vat_rate: 0, stock_quantity: 48, min_stock_level: 10, unit: 'each', active: 1 },
  { id: 'p4', barcode: '5918273', name: 'Cooking Oil 2L', category_id: 'cat-groceries', price: 65.00, cost_price: 48.00, vat_rate: 0, stock_quantity: 3, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p5', barcode: '6723891', name: 'Sugar 2kg', category_id: 'cat-groceries', price: 45.00, cost_price: 32.00, vat_rate: 0.16, stock_quantity: 67, min_stock_level: 10, unit: 'each', active: 1 },
  { id: 'p6', barcode: '7834562', name: 'Bread (White)', category_id: 'cat-groceries', price: 25.00, cost_price: 18.00, vat_rate: 0, stock_quantity: 30, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p7', barcode: '8945123', name: 'Coca-Cola 500ml', category_id: 'cat-beverages', price: 15.00, cost_price: 10.00, vat_rate: 0.16, stock_quantity: 200, min_stock_level: 20, unit: 'each', active: 1 },
  { id: 'p8', barcode: '9056784', name: 'Fanta Orange 500ml', category_id: 'cat-beverages', price: 15.00, cost_price: 10.00, vat_rate: 0.16, stock_quantity: 150, min_stock_level: 20, unit: 'each', active: 1 },
  { id: 'p9', barcode: '1167345', name: 'Castle Lager 340ml', category_id: 'cat-beverages', price: 22.00, cost_price: 15.00, vat_rate: 0.16, stock_quantity: 100, min_stock_level: 10, unit: 'each', active: 1 },
  { id: 'p10', barcode: '2278456', name: 'Mosi Lager 340ml', category_id: 'cat-beverages', price: 20.00, cost_price: 13.00, vat_rate: 0.16, stock_quantity: 100, min_stock_level: 10, unit: 'each', active: 1 },
  { id: 'p11', barcode: '3389567', name: 'Chicken Pieces (1kg)', category_id: 'cat-meat', price: 85.00, cost_price: 60.00, vat_rate: 0.16, stock_quantity: 40, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p12', barcode: '4490678', name: 'Bream Fish (Medium)', category_id: 'cat-meat', price: 120.00, cost_price: 80.00, vat_rate: 0.16, stock_quantity: 15, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p13', barcode: '8834012', name: 'Washing Powder 1kg', category_id: 'cat-household', price: 55.00, cost_price: 38.00, vat_rate: 0.16, stock_quantity: 45, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p14', barcode: '2167345', name: 'T-Shirt (Plain)', category_id: 'cat-clothing', price: 75.00, cost_price: 40.00, vat_rate: 0.16, stock_quantity: 30, min_stock_level: 5, unit: 'each', active: 1 },
  { id: 'p15', barcode: '4389567', name: 'Phone Charger USB-C', category_id: 'cat-electronics', price: 45.00, cost_price: 20.00, vat_rate: 0.16, stock_quantity: 0, min_stock_level: 5, unit: 'each', active: 1 },
]

let currentUser: (typeof MOCK_USERS)[number] | null = null

const mockApi = {
  // Auth
  login: async (username: string, pin: string) => {
    const user = MOCK_USERS.find(u => u.username === username && u.pin === pin)
    if (user) {
      currentUser = user
      const { pin: _, ...publicUser } = user
      return publicUser
    }
    return null
  },
  logout: async () => { currentUser = null },
  getCurrentUser: async () => {
    if (!currentUser) return null
    const { pin: _, ...publicUser } = currentUser
    return publicUser
  },

  // Products
  getProductByBarcode: async (barcode: string) => MOCK_PRODUCTS.find(p => p.barcode === barcode) || null,
  searchProducts: async (query: string) => {
    const q = query.toLowerCase()
    return MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q)))
  },
  getAllProducts: async (page = 1, limit = 50) => {
    const offset = (page - 1) * limit
    return { products: MOCK_PRODUCTS.slice(offset, offset + limit), total: MOCK_PRODUCTS.length, page, limit }
  },
  createProduct: async (product: any) => ({ ...product, id: 'new-' + Date.now() }),
  updateProduct: async (product: any) => product,

  // Sales
  completeSale: async () => ({ id: 'sale-' + Date.now(), receipt_number: String(Math.floor(Math.random() * 10000)).padStart(6, '0') }),
  exportDailySales: async () => { alert('Excel export is only available in the desktop app.'); return null },
  getDailySales: async () => ({
    total_sales: 12,
    total_revenue: 4250.50,
    total_vat: 585.00,
    items_sold: 38,
    cash_sales: 3200.00,
    mobile_sales: 1050.50,
    average_sale: 354.21
  }),

  // Categories
  getCategories: async () => MOCK_CATEGORIES,

  // Shifts
  openShift: async (_userId: string, openingCash: number) => ({ id: 'shift-1', user_id: _userId, opening_cash: openingCash, status: 'open', opened_at: new Date().toISOString() }),
  closeShift: async () => null,
  getCurrentShift: async () => ({ id: 'shift-1', user_id: 'u1', opening_cash: 500, status: 'open', opened_at: new Date().toISOString(), total_sales: 0, total_transactions: 0, total_vat: 0 }),

  // Settings
  getSettings: async () => ({
    shop_name: 'Ariemmas',
    shop_address: 'Independence Ave Mongu',
    shop_phone: '097 4542233',
    shop_tpin: '',
    vat_rate: '16',
    receipt_header: 'Welcome to Ariemmas!',
    receipt_footer: 'Thank you for shopping at Ariemmas!'
  }),
  updateSetting: async () => true,

  // Hardware
  printerStatus: async () => ({ connected: false, name: 'No printer (browser preview)' }),
  printReceipt: async () => true,
  openCashDrawer: async () => true,
}

export async function installBrowserMock(): Promise<void> {
  if (typeof window !== 'undefined' && !(window as any).api) {
    const apiUrl = (import.meta as any).env?.VITE_API_URL
    if (apiUrl) {
      // Web deployment — use real API client talking to Express backend
      const { webApi } = await import('./webApiClient')
      ;(window as any).api = webApi
      console.log(`[Web Mode] API client connected to ${apiUrl}`)
    } else {
      // Local dev preview — use mock data
      (window as any).api = mockApi
      console.log('[Browser Preview] Mock API installed — use admin/1234 or mary/5678 to log in')
    }
  }
}
