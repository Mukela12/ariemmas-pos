import { useState, useEffect } from 'react'
import { BarChart3, Calendar, TrendingUp, DollarSign, ShoppingBag, Download } from 'lucide-react'
import { formatZMW } from '../lib/currency'

interface DailySalesData {
  total_sales: number
  total_revenue: number
  total_vat: number
  items_sold: number
  cash_sales: number
  mobile_sales: number
  average_sale: number
}

export function Reports() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [data, setData] = useState<DailySalesData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    loadReport()
  }, [selectedDate])

  async function loadReport() {
    setIsLoading(true)
    const result = await window.api.getDailySales(selectedDate)
    setData(result)
    setIsLoading(false)
  }

  const stats = [
    { label: 'Total Revenue', value: data ? formatZMW(data.total_revenue) : 'K 0.00', icon: DollarSign },
    { label: 'Total Sales', value: data ? String(data.total_sales) : '0', icon: ShoppingBag },
    { label: 'Items Sold', value: data ? String(data.items_sold) : '0', icon: TrendingUp },
    { label: 'Average Sale', value: data ? formatZMW(data.average_sale) : 'K 0.00', icon: BarChart3 }
  ]

  async function handleExport() {
    setIsExporting(true)
    try {
      const filePath = await window.api.exportDailySales(selectedDate)
      if (filePath) {
        alert(`Exported to:\n${filePath}`)
      }
    } catch {
      alert('Export failed. Please try again.')
    }
    setIsExporting(false)
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7]">
        <div>
          <h1 className="text-lg font-semibold text-[#18181B]">Sales Reports</h1>
          <p className="text-[13px] text-[#71717A]">
            {isToday ? "Today's" : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-ZM', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{' '}
            overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#A1A1AA]" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 px-3 border border-[#E4E4E7] rounded-md text-sm text-[#18181B] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
          />
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="h-10 px-4 bg-[#0D9488] text-white text-sm font-medium rounded-md hover:bg-[#0F766E] disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={15} />
            {isExporting ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#E4E4E7] border-t-[#18181B] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white border border-[#E4E4E7] rounded-md p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 bg-[#F4F4F5] rounded-md flex items-center justify-center">
                      <stat.icon size={18} className="text-[#71717A]" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-[#18181B] tabular-nums">{stat.value}</p>
                  <p className="text-[11px] text-[#71717A] mt-1 uppercase tracking-[0.06em]">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Payment Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-[#E4E4E7] rounded-md p-5">
                <h3 className="text-sm font-semibold text-[#18181B] mb-4">Payment Methods</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#0D9488] rounded-full" />
                      <span className="text-sm text-[#52525B]">Cash</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#18181B] tabular-nums">
                        {formatZMW(data?.cash_sales || 0)}
                      </span>
                      <div className="w-24 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0D9488] rounded-full"
                          style={{
                            width: `${data?.total_revenue ? ((data.cash_sales / data.total_revenue) * 100) : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#18181B] rounded-full" />
                      <span className="text-sm text-[#52525B]">Mobile Money</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#18181B] tabular-nums">
                        {formatZMW(data?.mobile_sales || 0)}
                      </span>
                      <div className="w-24 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#18181B] rounded-full"
                          style={{
                            width: `${data?.total_revenue ? ((data.mobile_sales / data.total_revenue) * 100) : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E4E4E7] rounded-md p-5">
                <h3 className="text-sm font-semibold text-[#18181B] mb-4">Tax Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-[#71717A]">Gross Revenue</span>
                    <span className="text-sm font-medium text-[#18181B] tabular-nums">
                      {formatZMW(data?.total_revenue || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-[#F4F4F5]">
                    <span className="text-sm text-[#71717A]">VAT Collected (16%)</span>
                    <span className="text-sm font-medium text-[#18181B] tabular-nums">
                      {formatZMW(data?.total_vat || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-[#E4E4E7]">
                    <span className="text-sm font-semibold text-[#18181B]">Net Revenue</span>
                    <span className="text-sm font-bold text-[#18181B] tabular-nums">
                      {formatZMW((data?.total_revenue || 0) - (data?.total_vat || 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Empty state for no sales */}
            {data && data.total_sales === 0 && (
              <div className="bg-white border border-[#E4E4E7] rounded-md p-12 text-center">
                <div className="w-16 h-16 bg-[#F4F4F5] rounded-md flex items-center justify-center mx-auto mb-4">
                  <BarChart3 size={28} className="text-[#A1A1AA]" />
                </div>
                <p className="text-sm font-medium text-[#18181B]">No sales recorded</p>
                <p className="text-xs text-[#71717A] mt-1">
                  {isToday
                    ? 'Start making sales from the POS screen'
                    : 'No transactions were made on this date'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
