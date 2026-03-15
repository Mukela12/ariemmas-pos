import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Product, UserPublic, Sale, Shift, Category, CompleteSaleInput } from '../shared/types'

interface PosAPI {
  login(username: string, pin: string): Promise<UserPublic | null>
  logout(): Promise<boolean>
  getCurrentUser(): Promise<UserPublic | null>

  getProductByBarcode(barcode: string): Promise<Product | null>
  searchProducts(query: string): Promise<Product[]>
  getAllProducts(page?: number, limit?: number): Promise<{ products: Product[]; total: number; page: number; limit: number }>
  createProduct(product: Partial<Product>): Promise<Product>
  updateProduct(product: Partial<Product> & { id: string }): Promise<Product>

  completeSale(input: CompleteSaleInput): Promise<Sale>
  getDailySales(date: string): Promise<any>
  exportDailySales(date: string): Promise<string | null>

  getCategories(): Promise<Category[]>

  openShift(userId: string, openingCash: number): Promise<Shift>
  closeShift(shiftId: string, closingCash: number, notes: string): Promise<Shift | null>
  getCurrentShift(userId: string): Promise<Shift | null>

  getSettings(): Promise<Record<string, string>>
  updateSetting(key: string, value: string): Promise<boolean>

  printerStatus(): Promise<{ connected: boolean; name: string }>
  printReceipt(receipt: any): Promise<boolean>
  openCashDrawer(): Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PosAPI
  }
}
