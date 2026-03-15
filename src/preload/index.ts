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
  openShift: (userId: string, openingCash: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_OPEN, userId, openingCash),
  closeShift: (shiftId: string, closingCash: number, notes: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_CLOSE, shiftId, closingCash, notes),
  getCurrentShift: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_GET_CURRENT, userId),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  updateSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, key, value),

  // Hardware
  printerStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_PRINTER_STATUS),
  printReceipt: (receipt: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_PRINT_RECEIPT, receipt),
  openCashDrawer: () =>
    ipcRenderer.invoke(IPC_CHANNELS.HW_OPEN_DRAWER),

  // Sync
  getSyncStatus: () =>
    ipcRenderer.invoke('sync:status'),
  syncNow: () =>
    ipcRenderer.invoke('sync:now'),
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
