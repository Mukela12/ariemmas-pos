import { useState, useEffect } from 'react'
import { Package, Plus, Search, Edit2 } from 'lucide-react'
import { formatZMW } from '../lib/currency'
import type { Product, Category } from '../../../shared/types'

export function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const LIMIT = 50

  const [form, setForm] = useState({
    name: '',
    barcode: '',
    price: '',
    cost_price: '',
    stock_quantity: '',
    category_id: '',
    vat_rate: '0.16',
    min_stock_level: '5',
    unit: 'each'
  })

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [page])

  async function loadProducts() {
    setIsLoading(true)
    const result = await window.api.getAllProducts(page, LIMIT)
    setProducts(result.products)
    setTotal(result.total)
    setIsLoading(false)
  }

  async function loadCategories() {
    const cats = await window.api.getCategories()
    setCategories(cats)
  }

  function openAddForm() {
    setEditingProduct(null)
    setForm({
      name: '',
      barcode: '',
      price: '',
      cost_price: '',
      stock_quantity: '',
      category_id: categories[0]?.id || '',
      vat_rate: '0.16',
      min_stock_level: '5',
      unit: 'each'
    })
    setShowForm(true)
  }

  function openEditForm(product: Product) {
    setEditingProduct(product)
    setForm({
      name: product.name,
      barcode: product.barcode || '',
      price: String(product.price),
      cost_price: String(product.cost_price || ''),
      stock_quantity: String(product.stock_quantity),
      category_id: product.category_id || '',
      vat_rate: String(product.vat_rate),
      min_stock_level: String(product.min_stock_level),
      unit: product.unit
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data: Partial<Product> = {
      name: form.name,
      barcode: form.barcode || undefined,
      price: parseFloat(form.price),
      cost_price: form.cost_price ? parseFloat(form.cost_price) : undefined,
      stock_quantity: parseInt(form.stock_quantity) || 0,
      category_id: form.category_id || undefined,
      vat_rate: parseFloat(form.vat_rate),
      min_stock_level: parseInt(form.min_stock_level) || 5,
      unit: form.unit
    }

    if (editingProduct) {
      data.id = editingProduct.id
      await window.api.updateProduct(data as Partial<Product> & { id: string })
    } else {
      await window.api.createProduct(data)
    }
    setShowForm(false)
    loadProducts()
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const totalPages = Math.ceil(total / LIMIT)

  const getStockColor = (qty: number, min: number) => {
    if (qty <= 0) return 'text-[#DC2626] bg-[#FEF2F2]'
    if (qty <= min) return 'text-[#D97706] bg-[#FFFBEB]'
    return 'text-[#16A34A] bg-[#F0FDF4]'
  }

  const getStockLabel = (qty: number, min: number) => {
    if (qty <= 0) return 'Out of Stock'
    if (qty <= min) return 'Low Stock'
    return 'In Stock'
  }

  const inputClass = 'w-full h-10 px-3 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'
  const labelClass = 'block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7]">
        <div>
          <h1 className="text-lg font-semibold text-[#18181B]">Products</h1>
          <p className="text-[13px] text-[#71717A]">{total} items in inventory</p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 h-10 px-4 bg-[#0D9488] text-white rounded-md text-sm font-medium hover:bg-[#0F766E]"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex items-center gap-3 border-b border-[#F4F4F5]">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or scan barcode..."
            className="w-full h-10 pl-9 pr-4 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              selectedCategory === 'all'
                ? 'bg-[#18181B] text-white'
                : 'bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                selectedCategory === cat.id
                  ? 'bg-[#18181B] text-white'
                  : 'bg-[#F4F4F5] text-[#52525B] hover:bg-[#E4E4E7]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#E4E4E7] border-t-[#18181B] rounded-full animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#A1A1AA]">
            <Package size={48} strokeWidth={1} />
            <p className="mt-3 text-sm font-medium">No products found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F4F4F5]">
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Product</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Barcode</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Category</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Price</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Cost</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Stock</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Status</th>
                <th className="text-right px-6 py-3 text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const category = categories.find((c) => c.id === product.category_id)
                return (
                  <tr
                    key={product.id}
                    className="border-b border-[#F4F4F5] hover:bg-[#FAFAFA]"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#F4F4F5] rounded-md flex items-center justify-center">
                          <Package size={14} className="text-[#A1A1AA]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#18181B]">{product.name}</p>
                          <p className="text-[11px] text-[#A1A1AA]">
                            {product.unit} · VAT {(Number(product.vat_rate) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#52525B] font-mono">
                        {product.barcode || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-[#F4F4F5] text-[#52525B] rounded-md">
                        {category?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-[#18181B] tabular-nums">
                        {formatZMW(product.price)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-[#71717A] tabular-nums">
                        {product.cost_price ? formatZMW(product.cost_price) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-[#18181B] tabular-nums">
                        {product.stock_quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-md font-medium ${getStockColor(product.stock_quantity, product.min_stock_level)}`}
                      >
                        {getStockLabel(product.stock_quantity, product.min_stock_level)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => openEditForm(product)}
                        className="p-1.5 text-[#A1A1AA] hover:text-[#52525B] hover:bg-[#F4F4F5] rounded-md"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#E4E4E7]">
          <p className="text-xs text-[#71717A]">
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs font-medium text-[#71717A] tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-lg border border-[#E4E4E7] w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E4E4E7]">
              <h2 className="text-base font-semibold text-[#18181B]">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <p className="text-[13px] text-[#71717A] mt-0.5">
                {editingProduct ? 'Update product details' : 'Add a new item to your inventory'}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Product Name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Mealie Meal 25kg"
                  />
                </div>
                <div>
                  <label className={labelClass}>Barcode</label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder="Scan or type"
                  />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Selling Price (K)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={`${inputClass} tabular-nums`}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={labelClass}>Cost Price (K)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className={`${inputClass} tabular-nums`}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={labelClass}>Stock Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock_quantity}
                    onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                    className={`${inputClass} tabular-nums`}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelClass}>Min Stock Alert</label>
                  <input
                    type="number"
                    min="0"
                    value={form.min_stock_level}
                    onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })}
                    className={`${inputClass} tabular-nums`}
                    placeholder="5"
                  />
                </div>
                <div>
                  <label className={labelClass}>VAT Rate</label>
                  <select
                    value={form.vat_rate}
                    onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                    className={inputClass}
                  >
                    <option value="0.16">Standard (16%)</option>
                    <option value="0">Zero Rated (0%)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Unit</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={inputClass}
                  >
                    <option value="each">Each</option>
                    <option value="kg">Kilogram</option>
                    <option value="litre">Litre</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="metre">Metre</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-10 px-4 text-sm font-medium text-[#52525B] hover:bg-[#F4F4F5] rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#0D9488] text-white text-sm font-medium rounded-md hover:bg-[#0F766E]"
                >
                  {editingProduct ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
