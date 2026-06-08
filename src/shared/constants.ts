export const VAT_RATE = 0.16
export const CURRENCY_SYMBOL = 'K'
export const CURRENCY_CODE = 'ZMW'

export const SHOP = {
  name: 'Ariemmas',
  address: 'Independence Ave Mongu',
  phone: '097 4542233',
  tin: ''
} as const

export const ROLES = {
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin'
} as const

export const PAYMENT_METHODS = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  SPLIT: 'split'
} as const

export const SALE_STATUS = {
  COMPLETED: 'completed',
  VOIDED: 'voided',
  REFUNDED: 'refunded'
} as const

export const IPC_CHANNELS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_CURRENT: 'auth:getCurrent',

  // Products
  PRODUCT_GET_BY_BARCODE: 'db:product:getByBarcode',
  PRODUCT_SEARCH: 'db:product:search',
  PRODUCT_GET_ALL: 'db:product:getAll',
  PRODUCT_CREATE: 'db:product:create',
  PRODUCT_UPDATE: 'db:product:update',
  PRODUCT_DELETE: 'db:product:delete',

  // Sales
  SALE_COMPLETE: 'db:sale:complete',
  SALE_GET_DAILY: 'db:sale:getDaily',
  SALE_EXPORT_DAILY: 'db:sale:exportDaily',

  // Categories
  CATEGORY_GET_ALL: 'db:category:getAll',

  // Shifts
  SHIFT_OPEN: 'db:shift:open',
  SHIFT_CLOSE: 'db:shift:close',
  SHIFT_GET_CURRENT: 'db:shift:getCurrent',

  // Settings
  SETTINGS_GET_ALL: 'db:settings:getAll',
  SETTINGS_UPDATE: 'db:settings:update',

  // Users (admin cashier management)
  USERS_LIST: 'db:users:list',
  USERS_SET_PIN: 'db:users:setPin',
  USERS_CREATE: 'db:users:create',
  USERS_RENAME: 'db:users:rename',

  // Inventory management
  INVENTORY_ADJUST: 'db:inventory:adjust',
  INVENTORY_MOVEMENTS: 'db:inventory:movements',
  INVENTORY_SUMMARY: 'db:inventory:summary',

  // Hardware
  HW_PRINT_RECEIPT: 'hw:printReceipt',
  HW_OPEN_DRAWER: 'hw:openCashDrawer',
  HW_PRINTER_STATUS: 'hw:printerStatus',
  HW_LIST_PRINTERS: 'hw:listPrinters',
  HW_TEST_PRINT: 'hw:testPrint',

  // Product images
  IMAGE_SAVE: 'img:saveProductImage'
} as const
