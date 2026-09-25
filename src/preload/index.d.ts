import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Product, UserPublic, Sale, Shift, Category, CompleteSaleInput, PrintableReceipt, ManagedUser, StockMovement, InventorySummary, SaleForRefund, CreateRefundInput, Refund, PrintableRefund } from '../shared/types'

interface PosAPI {
  login(username: string, pin: string): Promise<UserPublic | null>
  logout(): Promise<boolean>
  getCurrentUser(): Promise<UserPublic | null>

  getProductByBarcode(barcode: string): Promise<Product | null>
  getProductByPlu(plu: number): Promise<Product | null>
  searchProducts(query: string): Promise<Product[]>
  getAllProducts(page?: number, limit?: number): Promise<{ products: Product[]; total: number; page: number; limit: number }>
  createProduct(product: Partial<Product>): Promise<Product>
  updateProduct(product: Partial<Product> & { id: string }): Promise<Product>
  deleteProduct(id: string): Promise<boolean>

  completeSale(input: CompleteSaleInput): Promise<Sale>
  getDailySales(date: string): Promise<any>
  exportDailySales(date: string): Promise<string | null>
  // Range reports — web build only for now; the desktop Reports page
  // feature-detects this and falls back to single-day view.
  getRangeSales?(from: string, to: string): Promise<any>

  // Refunds — admin-only, desktop only (absent on the web build).
  getSaleForRefund?(receiptNumber: string): Promise<SaleForRefund | null>
  createRefund?(input: CreateRefundInput): Promise<Refund>
  printRefund?(refund: PrintableRefund): Promise<boolean>

  getCategories(): Promise<Category[]>

  openShift(userId: string, openingCash: number, cashierName?: string): Promise<Shift>
  closeShift(shiftId: string, closingCash: number, notes: string): Promise<Shift | null>
  getCurrentShift(userId: string): Promise<Shift | null>

  getSettings(): Promise<Record<string, string>>
  updateSetting(key: string, value: string): Promise<boolean>

  // Admin cashier management — desktop only (absent on the web build).
  listUsers?(): Promise<ManagedUser[]>
  setUserPin?(userId: string, newPin: string): Promise<{ ok: boolean; error?: string }>
  createCashier?(username: string, displayName: string, pin: string): Promise<{ ok: boolean; error?: string }>
  renameUser?(userId: string, displayName: string): Promise<{ ok: boolean; error?: string }>

  // Inventory management
  adjustStock(productId: string, newQuantity: number, reason: string, type?: string): Promise<{ ok: boolean; error?: string; product?: Product }>
  getStockMovements(productId?: string, limit?: number): Promise<StockMovement[]>
  getInventorySummary(): Promise<InventorySummary>

  printerStatus(): Promise<{ connected: boolean; name: string }>
  listPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
  printReceipt(receipt: PrintableReceipt): Promise<boolean>
  testPrint(): Promise<{ ok: boolean; error?: string }>
  openCashDrawer(): Promise<boolean>

  saveProductImage(dataBase64: string, originalName?: string): Promise<string>

  getSyncStatus(): Promise<{ pending: number; failed: number; lastSynced: string | null; isOnline: boolean }>
  syncNow(): Promise<{ synced: number; failed: number; pulled?: number }>
  // Desktop only: subscribe to catalog-pull updates; returns an unsubscribe fn.
  onCatalogUpdated?(cb: () => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PosAPI
  }
}
