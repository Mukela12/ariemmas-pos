export interface User {
  id: string
  username: string
  display_name: string
  pin_hash: string
  role: 'cashier' | 'manager' | 'admin'
  active: number
  failed_attempts: number
  locked_until: string | null
  created_at: string
  updated_at: string
}

export interface UserPublic {
  id: string
  username: string
  display_name: string
  role: 'cashier' | 'manager' | 'admin'
  active: number
}

export interface Category {
  id: string
  name: string
  description: string | null
  sort_order: number
  active: number
  created_at: string
}

export interface Product {
  id: string
  barcode: string | null
  name: string
  category_id: string | null
  price: number
  cost_price: number
  vat_rate: number
  stock_quantity: number
  min_stock_level: number
  unit: string
  is_weighted: number
  // PLU number programmed on the label-printing scale. A scanned scale label
  // (EAN-13 starting with 2) carries this PLU; the till matches it to find the
  // product, then charges the price encoded on the label.
  scale_plu: number | null
  image_filename: string | null
  image_url: string | null
  active: number
  created_at: string
  updated_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  barcode: string | null
  quantity: number
  unit_price: number
  vat_rate: number
  vat_amount: number
  discount_amount: number
  line_total: number
}

export interface Sale {
  id: string
  receipt_number: string
  user_id: string
  shift_id: string | null
  subtotal: number
  vat_total: number
  discount_total: number
  total: number
  payment_method: 'cash' | 'mobile_money' | 'split'
  amount_tendered: number | null
  change_given: number | null
  mobile_ref: string | null
  status: 'completed' | 'voided' | 'refunded'
  void_reason: string | null
  void_by: string | null
  zra_fiscal_code: string | null
  terminal_id: string | null
  created_at: string
}

export interface Shift {
  id: string
  user_id: string
  cashier_name: string | null
  opening_cash: number
  closing_cash: number | null
  expected_cash: number | null
  variance: number | null
  total_sales: number
  total_transactions: number
  total_vat: number
  status: 'open' | 'closed'
  notes: string | null
  opened_at: string
  closed_at: string | null
  cash_alert_sent_at?: string | null
  cash_sales?: number
  cash_in_drawer?: number
}

export interface AuditEntry {
  id: string
  user_id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  details: string | null
  created_at: string
}

export interface AppSettings {
  shop_name: string
  shop_address: string
  shop_phone: string
  shop_tpin: string
  vat_rate: string
  currency_symbol: string
  currency_code: string
  receipt_header: string
  receipt_footer: string
  auto_logout_minutes: string
  receipt_counter: string
  opening_cash_limit: string
  cash_alert_threshold: string
  cash_alert_email: string
}

// A processed return. Money goes back to the customer; the original sale row
// stays 'completed' (the money WAS taken) and reports subtract refunds instead.
export interface Refund {
  id: string
  sale_id: string
  refund_number: string
  user_id: string | null
  shift_id: string | null
  reason: string | null
  total: number
  vat_total: number
  restocked: number
  terminal_id: string | null
  created_at: string
}

export interface RefundItem {
  id: string
  refund_id: string
  sale_item_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  vat_amount: number
  line_total: number
}

// A sale item plus how much of it has already been refunded.
export interface RefundableSaleItem extends SaleItem {
  refunded_quantity: number
}

export interface SaleForRefund {
  sale: Sale
  items: RefundableSaleItem[]
  refunds: Refund[]
}

export interface CreateRefundInput {
  sale_id: string
  items: { sale_item_id: string; quantity: number }[]
  reason: string
  restock: boolean
}

export interface PrintableRefund {
  refundNumber: string
  originalReceipt: string
  shopName: string
  shopAddress: string
  shopPhone: string
  shopTpin: string
  items: ReceiptLineItem[]
  total: number
  reason: string | null
  processedBy: string
  printedAt: string
}

// One entry in a product's stock history (inventory audit trail).
export interface StockMovement {
  id: string
  product_id: string
  type: 'sale' | 'restock' | 'adjustment' | 'correction' | 'refund'
  quantity_change: number
  balance_after: number
  reason: string | null
  user_id: string | null
  terminal_id: string | null
  created_at: string
  product_name?: string
}

export interface InventorySummary {
  items: number
  units: number
  lowStock: number
  outOfStock: number
  stockValue: number
}

// Admin view of a login (Cashiers screen). `pin` is the readable PIN, shown to
// the admin only; it's never sent over the public web API.
export interface ManagedUser {
  id: string
  username: string
  display_name: string
  pin: string | null
  role: 'admin' | 'cashier' | 'manager'
}

export interface CartItem {
  product_id: string
  barcode: string | null
  name: string
  price: number
  vat_rate: number
  quantity: number
  line_total: number
  vat_amount: number
  is_weighted?: boolean
  image_url?: string | null
  image_filename?: string | null
}

export interface CompleteSaleInput {
  items: CartItem[]
  subtotal: number
  vat_total: number
  total: number
  payment_method: 'cash' | 'mobile_money' | 'split'
  amount_tendered: number | null
  change_given: number | null
  mobile_ref: string | null
  user_id: string
  shift_id: string | null
}

export interface DailySalesReport {
  date: string
  total_sales: number
  total_vat: number
  total_transactions: number
  total_items_sold: number
}

export interface ReceiptLineItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

export interface PrintableReceipt {
  receiptNumber: string
  shopName: string
  shopAddress: string
  shopPhone: string
  shopTpin: string
  receiptHeader: string
  receiptFooter: string
  items: ReceiptLineItem[]
  subtotal: number
  vatTotal: number
  total: number
  paymentMethod: 'cash' | 'mobile_money' | 'split'
  amountTendered: number | null
  changeGiven: number | null
  mobileRef: string | null
  cashierName: string
  cashierPerson?: string | null
  printedAt: string
}
