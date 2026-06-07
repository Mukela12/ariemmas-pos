import { useState, useEffect, useRef } from 'react'
import { Package, Plus, Search, Edit2, Download, RefreshCw, ImagePlus, X as XIcon } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { formatZMW, formatStock } from '../lib/currency'
import { productImageSrc, fileToDataUrl, uploadToCloudinary, isElectron } from '../lib/productImage'
import type { Product, Category } from '../../../shared/types'

function generateBarcodeValue(): string {
  // 12-digit numeric, prefixed with 2 (internal-use convention), to encode safely as Code128.
  const ts = Date.now().toString()
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return ('2' + ts.slice(-8) + rand).slice(0, 12)
}

function BarcodePreview({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8
      })
      setError(null)
    } catch (e) {
      setError('Invalid barcode value')
    }
  }, [value])

  function handleDownload() {
    const svg = svgRef.current
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const svg64 = btoa(unescape(encodeURIComponent(xml)))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * 3
      canvas.height = img.height * 3
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const link = document.createElement('a')
      link.download = `barcode-${value}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = 'data:image/svg+xml;base64,' + svg64
  }

  if (!value) return null
  return (
    <div className="bg-white border border-[#E4E4E7] rounded-[4px] p-3 flex items-center gap-3">
      <svg ref={svgRef} className="flex-1" />
      <button
        type="button"
        onClick={handleDownload}
        disabled={!!error}
        className="shrink-0 h-9 px-3 rounded-[4px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-1.5 disabled:opacity-50"
        title="Download as PNG"
      >
        <Download size={13} /> PNG
      </button>
    </div>
  )
}

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
    unit: 'each',
    is_weighted: false,
    image_filename: '' as string,
    image_url: '' as string
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

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
      unit: 'each',
      is_weighted: false,
      image_filename: '',
      image_url: ''
    })
    setImagePreview(null)
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
      unit: product.unit,
      is_weighted: !!product.is_weighted,
      image_filename: product.image_filename || '',
      image_url: product.image_url || ''
    })
    setImagePreview(productImageSrc(product))
    setShowForm(true)
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setImageBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      setImagePreview(dataUrl) // instant preview
      if (isElectron) {
        // Desktop: cache the file on disk and store its filename.
        const filename = await window.api.saveProductImage(dataUrl, file.name)
        setForm((f) => ({ ...f, image_filename: filename }))
      } else {
        // Web admin: upload to Cloudinary (if configured).
        const url = await uploadToCloudinary(file)
        if (url) setForm((f) => ({ ...f, image_url: url }))
      }
    } catch {
      // keep the preview; the user can retry
    } finally {
      setImageBusy(false)
    }
  }

  function removeImage() {
    setImagePreview(null)
    setForm((f) => ({ ...f, image_filename: '', image_url: '' }))
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
      unit: form.is_weighted ? 'kg' : form.unit,
      is_weighted: form.is_weighted ? 1 : 0,
      image_filename: form.image_filename || null,
      image_url: form.image_url || null
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

  const inputClass = 'w-full h-10 px-3 rounded-[4px] border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'
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
          className="flex items-center gap-2 h-10 px-4 bg-[#0D9488] text-white rounded-[4px] text-sm font-medium hover:bg-[#0F766E]"
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
            className="w-full h-10 pl-9 pr-4 rounded-[4px] border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-[4px] text-xs font-medium ${
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
              className={`px-3 py-1.5 rounded-[4px] text-xs font-medium ${
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
                        <div className="w-9 h-9 bg-[#F4F4F5] rounded-[4px] flex items-center justify-center overflow-hidden shrink-0">
                          {productImageSrc(product)
                            ? <img src={productImageSrc(product)!} alt="" className="w-full h-full object-cover" />
                            : <Package size={14} className="text-[#A1A1AA]" />}
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
                      <span className="text-xs px-2 py-1 bg-[#F4F4F5] text-[#52525B] rounded-[4px]">
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
                        {formatStock(product.stock_quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-[4px] font-medium ${getStockColor(product.stock_quantity, product.min_stock_level)}`}
                      >
                        {getStockLabel(product.stock_quantity, product.min_stock_level)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => openEditForm(product)}
                        className="p-1.5 text-[#A1A1AA] hover:text-[#52525B] hover:bg-[#F4F4F5] rounded-[4px]"
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
              className="px-3 py-1.5 text-xs font-medium rounded-[4px] border border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs font-medium text-[#71717A] tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-[4px] border border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5] disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="relative bg-white rounded-[6px] border border-[#E4E4E7] w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="graphite px-6 py-4 shrink-0">
              <h2 className="text-base font-semibold text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <p className="text-[13px] text-white/55 mt-0.5">
                {editingProduct ? 'Update product details' : 'Add a new item to your inventory'}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto">
              {/* Image picker */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-[6px] border border-[#E4E4E7] bg-[#FAFAFA] overflow-hidden flex items-center justify-center shrink-0">
                  {imagePreview
                    ? <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    : <Package size={24} className="text-[#D4D4D8]" />}
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Product Image</label>
                  <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageBusy}
                      className="h-9 px-3 rounded-[4px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-1.5 disabled:opacity-50">
                      <ImagePlus size={14} /> {imageBusy ? 'Saving…' : imagePreview ? 'Change' : 'Upload image'}
                    </button>
                    {imagePreview && (
                      <button type="button" onClick={removeImage}
                        className="h-9 px-3 rounded-[4px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1.5">
                        <XIcon size={14} /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#71717A] mt-1.5">
                    {isElectron
                      ? 'Saved on this terminal so it shows even when offline.'
                      : 'Uploaded to the cloud and synced to all terminals.'}
                  </p>
                </div>
              </div>
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
                <div className="col-span-2">
                  <label className={labelClass}>Barcode</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      className={`${inputClass} font-mono`}
                      placeholder="Scan, type, or generate"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, barcode: generateBarcodeValue() })}
                      className="shrink-0 h-10 px-3 rounded-[4px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-1.5"
                      title="Generate a new offline barcode"
                    >
                      <RefreshCw size={13} /> Generate
                    </button>
                  </div>
                  {form.barcode && (
                    <div className="mt-2">
                      <BarcodePreview value={form.barcode} />
                      <p className="text-[11px] text-[#71717A] mt-1.5">
                        Download the PNG to print labels for items prepared in-store.
                      </p>
                    </div>
                  )}
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
                    value={form.is_weighted ? 'kg' : form.unit}
                    disabled={form.is_weighted}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={`${inputClass} disabled:opacity-60`}
                  >
                    <option value="each">Each</option>
                    <option value="kg">Kilogram</option>
                    <option value="litre">Litre</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="metre">Metre</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2.5 py-2 px-3 rounded-[4px] border border-[#E4E4E7] cursor-pointer hover:bg-[#FAFAFA]">
                    <input
                      type="checkbox"
                      checked={form.is_weighted}
                      onChange={(e) => setForm({ ...form, is_weighted: e.target.checked, unit: e.target.checked ? 'kg' : form.unit })}
                      className="w-4 h-4 accent-[#0D9488]"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#18181B]">Sold by weight (butchery)</div>
                      <div className="text-[11px] text-[#71717A]">Cashier weighs the item and types the weight in kg; the price above is price per kg.</div>
                    </div>
                  </label>
                </div>
              </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E4E4E7] bg-[#FAFAFA] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-10 px-4 text-sm font-medium text-[#52525B] hover:bg-[#F4F4F5] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#0D9488] text-white text-sm font-medium rounded-[4px] hover:bg-[#0F766E]"
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
