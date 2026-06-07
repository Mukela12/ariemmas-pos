import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { LogOut, X, Cloud, CloudOff, RefreshCw, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatZMW } from '../lib/currency'
import { NumberKeypad } from './NumberKeypad'
import logoUrl from '../assets/logo.png'

const NAV_ITEMS = [
  { path: '/', label: 'Sale', roles: ['cashier', 'manager', 'admin'] },
  { path: '/products', label: 'Products', roles: ['manager', 'admin'] },
  { path: '/reports', label: 'Reports', roles: ['manager', 'admin'] },
  { path: '/settings', label: 'Settings', roles: ['admin'] }
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const { currentShift, loadShift, setShift } = useShiftStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ pending: number; isOnline: boolean } | null>(null)

  useEffect(() => {
    if (user) loadShift(user.id)
  }, [user, loadShift])

  // Poll sync status every 10s (only in Electron)
  useEffect(() => {
    if (!window.api?.getSyncStatus) return
    const poll = () => window.api.getSyncStatus().then(setSyncStatus).catch(() => {})
    poll()
    const timer = setInterval(poll, 10_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(user?.role || 'cashier')
  )

  return (
    <div className="flex flex-col h-screen bg-[#F4F4F5]">
      {/* Top navigation bar — graphite with subtle texture */}
      <header className="graphite h-14 flex items-center px-4 shrink-0 relative border-b border-black/40">
        {/* Brand mark — persistent logo so it shows post-login too */}
        <div className="flex items-center gap-2.5 mr-4 pr-4 border-r border-white/10">
          <img src={logoUrl} alt="Ariemmas" className="w-7 h-7 object-contain" />
          <span className="text-[16px] font-semibold text-white tracking-tight">Ariemmas</span>
        </div>

        {/* Nav tabs */}
        <nav className="flex items-center gap-1">
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`px-4 py-2 text-sm font-medium rounded-[2px] transition-colors ${
                  isActive
                    ? 'bg-white/[0.12] text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Center — Clock (no icon, white text) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-white tabular-nums tracking-tight">
            {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-xs text-white/45 font-medium">
            {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2.5">
          {/* Shift indicator — clickable. Solid boxy chip integrated into the
              graphite bar; teal when open / amber when closed (colors unchanged). */}
          <button
            onClick={() => setShowShiftModal(true)}
            className={`flex items-center gap-2 px-3 h-8 rounded-[2px] text-xs font-semibold text-white transition-colors ${
              currentShift
                ? 'bg-[#0D9488] hover:bg-[#0F766E]'
                : 'bg-[#D97706] hover:bg-[#B45309]'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full bg-white/90 ${currentShift ? '' : 'animate-pulse'}`} />
            {currentShift ? 'Shift Open' : 'No Shift'}
          </button>

          {/* Sync indicator */}
          {syncStatus && (
            <button
              onClick={() => window.api?.syncNow?.()}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] text-xs font-medium transition-colors ${
                syncStatus.isOnline
                  ? syncStatus.pending > 0
                    ? 'text-[#FBBF24] bg-white/[0.06] border border-white/10'
                    : 'text-[#2DD4BF] bg-white/[0.06] border border-white/10'
                  : 'text-white/45 bg-white/[0.04] border border-white/10'
              }`}
              title={syncStatus.isOnline
                ? syncStatus.pending > 0 ? `${syncStatus.pending} pending sync` : 'Synced'
                : 'Offline — will sync when online'}
            >
              {syncStatus.isOnline ? (
                syncStatus.pending > 0 ? <RefreshCw size={13} className="animate-spin" /> : <Cloud size={13} />
              ) : (
                <CloudOff size={13} />
              )}
              {syncStatus.pending > 0 && <span>{syncStatus.pending}</span>}
            </button>
          )}

          {/* Divider */}
          <div className="w-px h-6 bg-white/15" />

          {/* User */}
          <div className="flex items-center gap-1.5 px-2">
            <User size={14} className="text-white/45" />
            <span className="text-[13px] text-white/85 font-medium">
              {user?.display_name}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-[2px] flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.1] transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* Shift Modal */}
      {showShiftModal && (
        <ShiftModal
          shift={currentShift}
          userId={user!.id}
          onClose={() => setShowShiftModal(false)}
          onShiftChange={(shift) => { setShift(shift); setShowShiftModal(false) }}
        />
      )}
    </div>
  )
}

function ShiftModal({
  shift, userId, onClose, onShiftChange
}: {
  shift: any
  userId: string
  onClose: () => void
  onShiftChange: (shift: any) => void
}) {
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [notes] = useState('')
  const [cashierName, setCashierName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openingLimit, setOpeningLimit] = useState(1000)
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'w-full h-11 px-3 rounded-[2px] border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'
  const cashDisplayClass = 'w-full h-12 px-4 rounded-[2px] border border-[#E4E4E7] bg-[#FAFAFA] flex items-center justify-end gap-1 text-[24px] font-bold text-[#18181B] tabular-nums'

  useEffect(() => {
    let isActive = true

    window.api.getSettings().then((settings) => {
      if (!isActive) return
      const limit = parseFloat(settings.opening_cash_limit || '1000') || 1000
      setOpeningLimit(limit)
      // Opening cash starts empty so the on-screen keypad drives it cleanly —
      // pre-filling a value made the keypad append to it (e.g. 1000 + 500).
    }).catch(() => {})

    return () => {
      isActive = false
    }
  }, [shift])

  const handleOpen = async () => {
    const amount = parseFloat(openingCash) || 0
    if (amount < 0) {
      setError('Opening cash cannot be negative.')
      return
    }
    if (amount > openingLimit) {
      setError(`Opening cash cannot be more than ${formatZMW(openingLimit)}.`)
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      if (!cashierName.trim()) {
        setError('Please enter the cashier\'s name (the actual person on shift).')
        setIsSubmitting(false)
        return
      }
      const newShift = await window.api.openShift(userId, amount, cashierName.trim())
      onShiftChange(newShift)
    } catch (err: any) {
      setError(err?.message || 'Failed to open shift.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = async () => {
    if (!shift) return
    const amount = parseFloat(closingCash) || 0
    setError(null)
    setIsSubmitting(true)
    try {
      await window.api.closeShift(shift.id, amount, notes)
      onShiftChange(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to close shift.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-[380px] bg-white rounded-[3px] shadow-xl overflow-y-auto max-h-[96vh]" onClick={(e) => e.stopPropagation()}>
        <div className="graphite px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-white">
            {shift ? 'Close Shift' : 'Open Shift'}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-[2px] hover:bg-white/10 flex items-center justify-center text-white/55 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {shift ? (
            <>
              <div className="p-3 bg-[#F4F4F5] rounded-[2px] space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Opening Cash</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.opening_cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Cash Sales</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.cash_sales || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Expected in Drawer</span>
                  <span className="text-[#18181B] font-semibold tabular-nums">{formatZMW(shift.cash_in_drawer || shift.opening_cash || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Transactions</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{shift.total_transactions || 0}</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Closing Cash — count the drawer</label>
                <div className={cashDisplayClass}>
                  <span className="text-[15px] text-[#A1A1AA] font-semibold">K</span>
                  {closingCash || <span className="text-[#D4D4D8]">0.00</span>}
                </div>
              </div>
              {error && (
                <div className="px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[2px]">
                  <p className="text-[13px] text-[#DC2626]">{error}</p>
                </div>
              )}
              <NumberKeypad
                value={closingCash}
                onChange={setClosingCash}
                onEnter={handleClose}
                enterLabel={isSubmitting ? '…' : 'CLOSE'}
                enterTone="teal"
                enterDisabled={isSubmitting}
                decimal
                maxLength={9}
              />
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Cashier&apos;s Name</label>
                <input
                  type="text"
                  value={cashierName}
                  onChange={(e) => { setCashierName(e.target.value); setError(null) }}
                  className={inputClass}
                  placeholder="e.g. Mary Banda"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Opening Cash (K {openingLimit.toFixed(0)} or less)</label>
                <div className={cashDisplayClass}>
                  <span className="text-[15px] text-[#A1A1AA] font-semibold">K</span>
                  {openingCash || <span className="text-[#D4D4D8]">0.00</span>}
                </div>
              </div>
              {error && (
                <div className="px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[2px]">
                  <p className="text-[13px] text-[#DC2626]">{error}</p>
                </div>
              )}
              <NumberKeypad
                value={openingCash}
                onChange={(v) => { setOpeningCash(v); setError(null) }}
                onEnter={handleOpen}
                enterLabel={isSubmitting ? '…' : 'OPEN'}
                enterTone="teal"
                enterDisabled={isSubmitting}
                decimal
                maxLength={9}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
