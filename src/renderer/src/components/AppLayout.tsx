import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { LogOut, X, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatZMW } from '../lib/currency'
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

  const cashSold = Number(currentShift?.total_sales || 0)
  const txnCount = Number(currentShift?.total_transactions || 0)

  return (
    <div className="flex flex-col h-screen bg-[var(--color-surface-alt)]">
      {/* Top bar — dark, dense, till-style */}
      <header className="h-14 bg-[var(--color-surface-deep)] flex items-stretch shrink-0 text-white">
        {/* Brand chip */}
        <div className="flex items-center gap-2.5 px-4 border-r border-white/10 min-w-[200px]">
          <div className="w-8 h-8 rounded bg-white/[0.08] flex items-center justify-center overflow-hidden shrink-0">
            <img src={logoUrl} alt="" className="w-5 h-5 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Ariemmas</div>
            <div className="text-[10px] text-white/50 uppercase tracking-wider">POS Till</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-stretch">
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`px-5 text-[13px] font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-white border-[var(--color-brand)] bg-white/[0.04]'
                    : 'text-white/60 border-transparent hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Live status strip */}
        <div className="flex items-stretch divide-x divide-white/10">
          {/* Shift card */}
          <button
            onClick={() => setShowShiftModal(true)}
            className="px-4 text-left hover:bg-white/[0.04] transition-colors"
          >
            <div className="text-[10px] text-white/50 uppercase tracking-wider leading-none mb-1">Shift</div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${currentShift ? 'bg-[var(--color-pay)]' : 'bg-[var(--color-warning)] animate-pulse'}`} />
              <span className="text-[13px] font-semibold tabular-nums">
                {currentShift ? formatZMW(cashSold) : 'Open shift'}
              </span>
              {currentShift && <span className="text-[10px] text-white/40 tabular-nums">{txnCount} txns</span>}
            </div>
          </button>

          {/* Sync */}
          {syncStatus && (
            <button
              onClick={() => window.api?.syncNow?.()}
              className="px-4 text-left hover:bg-white/[0.04] transition-colors"
              title={syncStatus.isOnline
                ? syncStatus.pending > 0 ? `${syncStatus.pending} pending sync` : 'Synced'
                : 'Offline — sales queued for sync'}
            >
              <div className="text-[10px] text-white/50 uppercase tracking-wider leading-none mb-1">Sync</div>
              <div className="flex items-center gap-1.5">
                {syncStatus.isOnline ? (
                  syncStatus.pending > 0
                    ? <RefreshCw size={12} className="animate-spin text-[var(--color-warning)]" />
                    : <Cloud size={12} className="text-[var(--color-pay)]" />
                ) : <CloudOff size={12} className="text-white/40" />}
                <span className="text-[13px] font-semibold">
                  {syncStatus.isOnline ? (syncStatus.pending > 0 ? `${syncStatus.pending} queued` : 'Live') : 'Offline'}
                </span>
              </div>
            </button>
          )}

          {/* Clock */}
          <div className="px-4 flex flex-col justify-center">
            <div className="text-[10px] text-white/50 uppercase tracking-wider leading-none mb-1">
              {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <div className="text-[15px] font-semibold tabular-nums tracking-tight">
              {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Cashier + logout */}
          <div className="px-4 flex items-center gap-3 bg-black/20">
            <div className="text-right leading-tight">
              <div className="text-[10px] text-white/50 uppercase tracking-wider">Cashier</div>
              <div className="text-[13px] font-semibold">{user?.display_name}</div>
            </div>
            <button
              onClick={handleLogout}
              className="w-9 h-9 rounded flex items-center justify-center bg-white/[0.06] hover:bg-[var(--color-error)]/80 transition-colors"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
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
  const [openingCash, setOpeningCash] = useState('1000')
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openingLimit, setOpeningLimit] = useState(1000)
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'w-full h-10 px-3 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'

  useEffect(() => {
    let isActive = true

    window.api.getSettings().then((settings) => {
      if (!isActive) return
      const limit = parseFloat(settings.opening_cash_limit || '1000') || 1000
      setOpeningLimit(limit)
      if (!shift) {
        setOpeningCash((current) => {
          const currentValue = parseFloat(current)
          if (!current || Number.isNaN(currentValue) || currentValue > limit) {
            return String(limit)
          }
          return current
        })
      }
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
      const newShift = await window.api.openShift(userId, amount)
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
      <div className="w-full max-w-[400px] bg-white rounded-lg shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#18181B]">
            {shift ? 'Close Shift' : 'Open Shift'}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-[#F4F4F5] flex items-center justify-center text-[#A1A1AA]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {shift ? (
            <>
              <div className="p-3 bg-[#F4F4F5] rounded-md space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Opened at</span>
                  <span className="text-[#18181B] font-medium">{new Date(shift.opened_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Opening Cash</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.opening_cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Sales Total</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.total_sales || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Cash Sales</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.cash_sales || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Cash in Drawer</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{formatZMW(shift.cash_in_drawer || shift.opening_cash || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Transactions</span>
                  <span className="text-[#18181B] font-medium tabular-nums">{shift.total_transactions || 0}</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Closing Cash (K)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                  placeholder="Count the cash drawer"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                  placeholder="Any notes for this shift"
                />
              </div>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="w-full h-10 rounded-md bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] disabled:opacity-50"
              >
                {isSubmitting ? 'Closing...' : 'Close Shift'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-[#71717A]">Open a new shift to start recording sales. Count the cash in the drawer before you begin.</p>
              <div>
                <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Opening Cash (K)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={openingLimit}
                  value={openingCash}
                  onChange={(e) => { setOpeningCash(e.target.value); setError(null) }}
                  className={`${inputClass} tabular-nums`}
                  placeholder={openingLimit.toFixed(2)}
                  autoFocus
                />
                <p className="mt-2 text-[11px] text-[#71717A]">
                  Opening cash should be {formatZMW(openingLimit)} or less.
                </p>
              </div>
              {error && (
                <div className="px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-md">
                  <p className="text-[13px] text-[#DC2626]">{error}</p>
                </div>
              )}
              <button
                onClick={handleOpen}
                disabled={isSubmitting}
                className="w-full h-10 rounded-md bg-[#0D9488] text-white text-sm font-medium hover:bg-[#0F766E] disabled:opacity-50"
              >
                {isSubmitting ? 'Opening...' : 'Open Shift'}
              </button>
            </>
          )}
          {shift && error && (
            <div className="px-3 py-2 bg-[#FEF2F2] border border-[#FECACA] rounded-md">
              <p className="text-[13px] text-[#DC2626]">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
