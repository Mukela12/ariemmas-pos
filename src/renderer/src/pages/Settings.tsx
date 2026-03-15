import { useState, useEffect } from 'react'
import { Store, Receipt, Printer, Save, Check, Wifi, WifiOff } from 'lucide-react'

export function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; name: string } | null>(null)

  useEffect(() => {
    loadSettings()
    checkPrinter()
  }, [])

  async function loadSettings() {
    setIsLoading(true)
    const result = await window.api.getSettings()
    setSettings(result)
    setIsLoading(false)
  }

  async function checkPrinter() {
    try {
      const status = await window.api.printerStatus()
      setPrinterStatus(status)
    } catch {
      setPrinterStatus({ connected: false, name: 'Unknown' })
    }
  }

  async function handleSave() {
    setIsSaving(true)
    for (const [key, value] of Object.entries(settings)) {
      await window.api.updateSetting(key, value)
    }
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateField(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const inputClass = 'w-full h-10 px-3 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'
  const labelClass = 'block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#E4E4E7] border-t-[#18181B] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7]">
        <div>
          <h1 className="text-lg font-semibold text-[#18181B]">Settings</h1>
          <p className="text-[13px] text-[#71717A]">Manage your POS configuration</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium ${
            saved
              ? 'bg-[#16A34A] text-white'
              : 'bg-[#18181B] text-white hover:bg-[#27272A]'
          } disabled:opacity-60`}
        >
          {saved ? (
            <>
              <Check size={16} />
              Saved
            </>
          ) : (
            <>
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Shop Info */}
          <div className="bg-white border border-[#E4E4E7] rounded-md overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F4F4F5]">
              <Store size={18} className="text-[#71717A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Shop Information</h2>
                <p className="text-[11px] text-[#71717A]">Business details shown on receipts</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Shop Name</label>
                <input
                  type="text"
                  value={settings.shop_name || ''}
                  onChange={(e) => updateField('shop_name', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input
                  type="text"
                  value={settings.shop_address || ''}
                  onChange={(e) => updateField('shop_address', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="text"
                    value={settings.shop_phone || ''}
                    onChange={(e) => updateField('shop_phone', e.target.value)}
                    className={inputClass}
                    placeholder="+260 XXX XXX XXX"
                  />
                </div>
                <div>
                  <label className={labelClass}>TPIN</label>
                  <input
                    type="text"
                    value={settings.shop_tpin || ''}
                    onChange={(e) => updateField('shop_tpin', e.target.value)}
                    className={inputClass}
                    placeholder="ZRA Tax Payer ID"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Settings */}
          <div className="bg-white border border-[#E4E4E7] rounded-md overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F4F4F5]">
              <Receipt size={18} className="text-[#71717A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Receipt Settings</h2>
                <p className="text-[11px] text-[#71717A]">Customize printed receipts</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Receipt Header Message</label>
                <input
                  type="text"
                  value={settings.receipt_header || ''}
                  onChange={(e) => updateField('receipt_header', e.target.value)}
                  className={inputClass}
                  placeholder="Welcome to Ariemmas!"
                />
              </div>
              <div>
                <label className={labelClass}>Receipt Footer Message</label>
                <input
                  type="text"
                  value={settings.receipt_footer || ''}
                  onChange={(e) => updateField('receipt_footer', e.target.value)}
                  className={inputClass}
                  placeholder="Thank you for shopping with us!"
                />
              </div>
              <div>
                <label className={labelClass}>VAT Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.vat_rate || '16'}
                  onChange={(e) => updateField('vat_rate', e.target.value)}
                  className={`${inputClass} max-w-[120px] tabular-nums`}
                />
              </div>
            </div>
          </div>

          {/* Hardware Status */}
          <div className="bg-white border border-[#E4E4E7] rounded-md overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F4F4F5]">
              <Printer size={18} className="text-[#71717A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Hardware</h2>
                <p className="text-[11px] text-[#71717A]">Connected peripherals status</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between py-3 px-4 bg-[#FAFAFA] rounded-md border border-[#F4F4F5]">
                <div className="flex items-center gap-3">
                  <Printer size={16} className="text-[#71717A]" />
                  <div>
                    <p className="text-sm font-medium text-[#18181B]">Receipt Printer</p>
                    <p className="text-[11px] text-[#71717A]">
                      {printerStatus?.name || 'Checking...'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {printerStatus?.connected ? (
                    <>
                      <Wifi size={14} className="text-[#16A34A]" />
                      <span className="text-xs font-medium text-[#16A34A]">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={14} className="text-[#A1A1AA]" />
                      <span className="text-xs font-medium text-[#A1A1AA]">Not Connected</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-[#FAFAFA] rounded-md border border-[#F4F4F5]">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <svg viewBox="0 0 16 16" width={16} height={16} className="text-[#71717A]" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="2" y="1" width="12" height="14" rx="1" />
                      <line x1="5" y1="5" x2="11" y2="5" />
                      <line x1="5" y1="8" x2="11" y2="8" />
                      <line x1="5" y1="11" x2="8" y2="11" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#18181B]">Barcode Scanner</p>
                    <p className="text-[11px] text-[#71717A]">USB HID Keyboard Mode</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Wifi size={14} className="text-[#16A34A]" />
                  <span className="text-xs font-medium text-[#16A34A]">Auto-detect</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
