import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useShiftStore } from '../stores/shiftStore'
import { LogOut, X, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatZMW } from '../lib/currency'

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
      {/* Top navigation bar — 48px */}
      <header className="h-12 bg-white border-b border-[#E4E4E7] flex items-center px-4 shrink-0">
        {/* Nav tabs */}
        <nav className="flex items-center gap-1">
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-[#F4F4F5] text-[#18181B]'
                    : 'text-[#71717A] hover:text-[#18181B] hover:bg-[#FAFAFA]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {/* Shift indicator — clickable */}
          <button
            onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F4F4F5] text-[11px] text-[#52525B] hover:bg-[#E4E4E7] transition-colors"
          >
            <div className={`w-[6px] h-[6px] rounded-full ${currentShift ? 'bg-[#0D9488]' : 'bg-[#D97706]'}`} />
            {currentShift ? 'Shift Open' : 'No Shift'}
          </button>

          {/* Sync indicator */}
          {syncStatus && (
            <button
              onClick={() => window.api?.syncNow?.()}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
                syncStatus.isOnline
                  ? syncStatus.pending > 0
                    ? 'text-[#D97706] bg-[#FFFBEB]'
                    : 'text-[#0D9488] bg-[#F0FDFA]'
                  : 'text-[#A1A1AA] bg-[#F4F4F5]'
              }`}
              title={syncStatus.isOnline
                ? syncStatus.pending > 0 ? `${syncStatus.pending} pending sync` : 'Synced'
                : 'Offline — will sync when online'}
            >
              {syncStatus.isOnline ? (
                syncStatus.pending > 0 ? <RefreshCw size={12} className="animate-spin" /> : <Cloud size={12} />
              ) : (
                <CloudOff size={12} />
              )}
              {syncStatus.pending > 0 && <span>{syncStatus.pending}</span>}
            </button>
          )}

          {/* Clock */}
          <span className="text-[12px] text-[#A1A1AA] tabular-nums font-medium">
            {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* User */}
          <span className="text-[12px] text-[#52525B] font-medium">
            {user?.display_name}
          </span>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#A1A1AA] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
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
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const inputClass = 'w-full h-10 px-3 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]'

  const handleOpen = async () => {
    const amount = parseFloat(openingCash) || 0
    setIsSubmitting(true)
    const newShift = await window.api.openShift(userId, amount)
    onShiftChange(newShift)
    setIsSubmitting(false)
  }

  const handleClose = async () => {
    if (!shift) return
    const amount = parseFloat(closingCash) || 0
    setIsSubmitting(true)
    await window.api.closeShift(shift.id, amount, notes)
    onShiftChange(null)
    setIsSubmitting(false)
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
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <button
                onClick={handleOpen}
                disabled={isSubmitting}
                className="w-full h-10 rounded-md bg-[#0D9488] text-white text-sm font-medium hover:bg-[#0F766E] disabled:opacity-50"
              >
                {isSubmitting ? 'Opening...' : 'Open Shift'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
