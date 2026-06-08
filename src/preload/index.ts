import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/constants'

const api = {
  // Auth
  login: (username: string, pin: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, username, pin),
  logout: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  getCurrentUser: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CURRENT),

  // Products
  getProductByBarcode: (barcode: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_GET_BY_BARCODE, barcode),
  searchProducts: (query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_SEARCH, query),
  getAllProducts: (page?: number, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_GET_ALL, page, limit),
  createProduct: (product: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_CREATE, product),
  updateProduct: (product: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_UPDATE, product),
  deleteProduct: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_DELETE, id),

  // Sales
  completeSale: (input: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_COMPLETE, input),
  getDailySales: (date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_GET_DAILY, date),
  exportDailySales: (date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_EXPORT_DAILY, date),

  // Categories
  getCategories: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_GET_ALL),

  // Shifts
  openShift: (userId: string, openingCash: number, cashierName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_OPEN, userId, openingCash, cashierName),
  closeShift: (shiftId: string, closingCash: number, notes: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_CLOSE, shiftId, closingCash, notes),
  getCurrentShift: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_GET_CURRENT, userId),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  updateSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, key, value),

  // Users (admin cashier management — desktop only)
  listUsers: () =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_LIST),
  setUserPin: (userId: string, newPin: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_SET_PIN, userId, newPin),
  createCashier: (username: string, displayName: string, pin: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_CREATE, username, displayName, pin),
  renameUser: (userId: string, displayName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_RENAME, userId, displayName),

  // Inventory management
  adjustStock: (productId: string, newQuantity: number, reason: string, type?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_ADJUST, productId, newQuantity, reason, type),
  getStockMovements: (productId?: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_MOVEMENTS, productId, limit),
  getInventorySummary: () =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_SUMMARY),

  // Hardware
  printerStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_PRINTER_STATUS),
  listPrinters: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_LIST_PRINTERS),
  printReceipt: (receipt: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_PRINT_RECEIPT, receipt),
  testPrint: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_TEST_PRINT),
  openCashDrawer: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_OPEN_DRAWER),

  // Product images
  saveProductImage: (dataBase64: string, originalName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMAGE_SAVE, dataBase64, originalName),

  // Sync
  getSyncStatus: () =>
    ipcRenderer.invoke('sync:status'),
  syncNow: () =>
    ipcRenderer.invoke('sync:now'),
  // Fired after a catalog pull changes local data, so screens can refresh.
  onCatalogUpdated: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('catalog:updated', handler)
    return () => ipcRenderer.removeListener('catalog:updated', handler)
  },
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
