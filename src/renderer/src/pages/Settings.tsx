import { useState, useEffect } from 'react'
import { Store, Receipt, Printer, Save, Check, Wifi, WifiOff, BellRing } from 'lucide-react'
import { setVatEnabled } from '../lib/taxConfig'
import { TouchInput } from '../components/TouchInput'

export function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; name: string } | null>(null)
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([])
  const [hwBusy, setHwBusy] = useState<'test' | 'drawer' | null>(null)
  const [hwMessage, setHwMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
    checkPrinter()
    loadPrinters()
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

  async function loadPrinters() {
    try {
      setPrinters(await window.api.listPrinters())
    } catch {
      setPrinters([])
    }
  }

  async function selectPrinter(name: string) {
    updateField('printer_name', name)
    await window.api.updateSetting('printer_name', name)
    await checkPrinter()
  }

  async function handleTestPrint() {
    setHwBusy('test')
    setHwMessage(null)
    try {
      const res = await window.api.testPrint()
      setHwMessage(res.ok ? { ok: true, text: 'Test page sent to printer' } : { ok: false, text: res.error || 'Test print failed' })
    } catch {
      setHwMessage({ ok: false, text: 'Test print failed' })
    } finally {
      setHwBusy(null)
    }
  }

  async function handleOpenDrawer() {
    setHwBusy('drawer')
    setHwMessage(null)
    try {
      const ok = await window.api.openCashDrawer()
      setHwMessage(ok ? { ok: true, text: 'Drawer kick sent' } : { ok: false, text: 'Could not open drawer — check printer' })
    } catch {
      setHwMessage({ ok: false, text: 'Could not open drawer' })
    } finally {
      setHwBusy(null)
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

  const inputClass = 'w-full h-10 px-3 rounded-[2px] border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'
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
          className={`flex items-center gap-2 h-10 px-4 rounded-[2px] text-sm font-medium ${
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
          <div className="bg-white border border-[#E4E4E7] rounded-[2px] overflow-hidden">
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
                <TouchInput value={settings.shop_name || ''} onChange={(v) => updateField('shop_name', v)} className={inputClass} placeholder="Ariemmas" />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <TouchInput value={settings.shop_address || ''} onChange={(v) => updateField('shop_address', v)} className={inputClass} placeholder="Independence Ave, Mongu" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Phone</label>
                  <TouchInput value={settings.shop_phone || ''} onChange={(v) => updateField('shop_phone', v)} className={inputClass} placeholder="+260 XXX XXX XXX" />
                </div>
                <div>
                  <label className={labelClass}>TPIN</label>
                  <TouchInput value={settings.shop_tpin || ''} onChange={(v) => updateField('shop_tpin', v)} mode="numeric" maxLength={10} title="ZRA TPIN" className={inputClass} placeholder="ZRA Tax Payer ID" />
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Settings */}
          <div className="bg-white border border-[#E4E4E7] rounded-[2px] overflow-hidden">
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
                <TouchInput value={settings.receipt_header || ''} onChange={(v) => updateField('receipt_header', v)} className={inputClass} placeholder="Welcome to Ariemmas!" />
              </div>
              <div>
                <label className={labelClass}>Receipt Footer Message</label>
                <TouchInput value={settings.receipt_footer || ''} onChange={(v) => updateField('receipt_footer', v)} className={inputClass} placeholder="Thank you for shopping with us!" />
              </div>
              {/* VAT on/off toggle */}
              <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-[2px] border border-[#E4E4E7] bg-[#FAFAFA]">
                <div>
                  <div className="text-sm font-medium text-[#18181B]">Charge VAT</div>
                  <div className="text-[11px] text-[#71717A] mt-0.5">Turn on only once the business is VAT-registered with ZRA. When off, no VAT is added or shown on receipts.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.vat_enabled === 'true'}
                  onClick={() => {
                    const next = settings.vat_enabled === 'true' ? 'false' : 'true'
                    updateField('vat_enabled', next)
                    setVatEnabled(next === 'true')
                  }}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.vat_enabled === 'true' ? 'bg-[#0D9488]' : 'bg-[#D4D4D8]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${settings.vat_enabled === 'true' ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div>
                <label className={labelClass}>VAT Rate (%)</label>
                <TouchInput
                  value={settings.vat_rate || '16'}
                  onChange={(v) => updateField('vat_rate', v)}
                  mode="decimal"
                  maxLength={5}
                  title="VAT rate (%)"
                  disabled={settings.vat_enabled !== 'true'}
                  className={`${inputClass} max-w-[120px] tabular-nums`}
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-[2px] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F4F4F5]">
              <BellRing size={18} className="text-[#71717A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Cash Drawer Alerts</h2>
                <p className="text-[11px] text-[#71717A]">Track cash in the register and notify when it reaches the threshold</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Opening Cash Limit (K)</label>
                  <TouchInput value={settings.opening_cash_limit || '1000'} onChange={(v) => updateField('opening_cash_limit', v)} mode="decimal" maxLength={9} title="Opening cash limit (K)" className={`${inputClass} tabular-nums`} />
                </div>
                <div>
                  <label className={labelClass}>Cash Alert Threshold (K)</label>
                  <TouchInput value={settings.cash_alert_threshold || '2000'} onChange={(v) => updateField('cash_alert_threshold', v)} mode="decimal" maxLength={9} title="Cash alert threshold (K)" className={`${inputClass} tabular-nums`} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Alert Email Recipient</label>
                <TouchInput value={settings.cash_alert_email || ''} onChange={(v) => updateField('cash_alert_email', v)} className={inputClass} placeholder="owner@example.com" />
                <p className="text-[11px] text-[#71717A] mt-2">
                  The app sends an alert when opening cash plus cash sales reaches the threshold above.
                </p>
              </div>
            </div>
          </div>

          {/* Hardware Status */}
          <div className="bg-white border border-[#E4E4E7] rounded-[2px] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F4F4F5]">
              <Printer size={18} className="text-[#71717A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18181B]">Hardware</h2>
                <p className="text-[11px] text-[#71717A]">Connected peripherals status</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between py-3 px-4 bg-[#FAFAFA] rounded-[2px] border border-[#F4F4F5]">
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

              {/* Printer selection + tests */}
              <div className="py-3 px-4 bg-[#FAFAFA] rounded-[2px] border border-[#F4F4F5] space-y-3">
                <div>
                  <label className={labelClass}>Active Printer</label>
                  <select
                    value={settings.printer_name || ''}
                    onChange={(e) => selectPrinter(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">System default printer</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName}{p.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#71717A] mt-1.5">
                    {printers.length === 0
                      ? 'No printers found in Windows. Install the printer driver first, then click Refresh.'
                      : 'Choose the receipt printer the cash drawer is plugged into.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={loadPrinters}
                    className="h-9 px-3 rounded-[2px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA]"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleTestPrint}
                    disabled={hwBusy !== null}
                    className="h-9 px-3 rounded-[2px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA] disabled:opacity-60"
                  >
                    {hwBusy === 'test' ? 'Printing...' : 'Test Print'}
                  </button>
                  <button
                    onClick={handleOpenDrawer}
                    disabled={hwBusy !== null}
                    className="h-9 px-3 rounded-[2px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#FAFAFA] disabled:opacity-60"
                  >
                    {hwBusy === 'drawer' ? 'Opening...' : 'Open Drawer'}
                  </button>
                  {hwMessage && (
                    <span className={`text-xs font-medium ${hwMessage.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {hwMessage.text}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-[#FAFAFA] rounded-[2px] border border-[#F4F4F5]">
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
