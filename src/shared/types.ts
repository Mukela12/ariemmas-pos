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
  created_at: string
}

export interface Shift {
  id: string
  user_id: string
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
  shop_tin: string
  vat_rate: string
  currency_symbol: string
  currency_code: string
  receipt_footer: string
  auto_logout_minutes: string
  receipt_counter: string
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
