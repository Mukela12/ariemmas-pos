import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import logoUrl from '../assets/logo.png'

const CASHIER_CREDENTIALS = [
  { name: 'Cashier 1', username: 'cashier1', pin: '1111' },
  { name: 'Cashier 2', username: 'cashier2', pin: '2222' },
  { name: 'Cashier 3', username: 'cashier3', pin: '3333' },
  { name: 'Cashier 4', username: 'cashier4', pin: '4444' },
  { name: 'Cashier 5', username: 'cashier5', pin: '5555' }
]

export function Login() {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { login, isLoading, error } = useAuthStore()

  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !pin.trim()) return
    const success = await login(username.trim().toLowerCase(), pin)
    if (success) navigate('/')
  }

  return (
    <div className="h-screen w-screen flex bg-white overflow-hidden">
      {/* Left — confident dark brand panel */}
      <div className="hidden lg:flex w-[44%] bg-[var(--color-surface-deep)] flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle gradient accent — no animated grid */}
        <div className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full opacity-60"
          style={{ background: 'radial-gradient(circle, rgba(15,118,110,0.20) 0%, transparent 70%)' }} />

        {/* Brand mark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-white/[0.08] flex items-center justify-center overflow-hidden">
            <img src={logoUrl} alt="" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white tracking-tight">Ariemmas</div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">Mongu</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)] mb-3">Point of Sale</div>
          <h1 className="text-[44px] leading-[1.05] font-bold text-white tracking-tight max-w-[420px]">
            Run the till, close the day.
          </h1>
          <p className="text-[14px] text-white/60 mt-4 max-w-[360px] leading-relaxed">
            Sign in to your shift. Sales, cash drawer, receipts and reports run from this terminal.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-white/40">
          <span>v1.0.7</span>
          <span>{new Date().getFullYear()} · Ariemmas Shop</span>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-[360px]">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded bg-[var(--color-surface-deep)] flex items-center justify-center overflow-hidden">
              <img src={logoUrl} alt="" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[var(--color-ink)]">Ariemmas POS</div>
              <div className="text-[11px] text-[var(--color-ink-3)]">Mongu</div>
            </div>
          </div>

          <h2 className="text-[24px] font-bold text-[var(--color-ink)] tracking-tight">Sign in</h2>
          <p className="text-[13px] text-[var(--color-ink-3)] mt-1.5">Pick your cashier below or type your username and PIN.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink-2)] mb-1.5">Username</label>
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cashier1"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-white text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pinRef.current?.focus() } }}
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink-2)] mb-1.5">PIN</label>
              <div className="relative">
                <input
                  ref={pinRef}
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full h-11 px-3 pr-10 rounded-md border border-[var(--color-border)] bg-white text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 tracking-[0.15em]"
                />
                <button type="button" onClick={() => setShowPin(!showPin)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-[var(--color-error-bg)] border border-[var(--color-error)]/30">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)] shrink-0 mt-1.5" />
                <p className="text-[13px] text-[var(--color-error)] leading-snug">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !pin.trim()}
              className="w-full h-11 rounded-md bg-[var(--color-surface-deep)] text-white text-[14px] font-semibold hover:bg-[var(--color-surface-deep-2)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? <><Loader2 size={15} className="animate-spin" />Signing in…</> : 'Sign in'}
            </button>
          </form>

          {/* Cashier picker — looks like a real "select your name" list */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">Cashier on shift</span>
              <span className="text-[11px] text-[var(--color-ink-4)]">click to sign in</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {CASHIER_CREDENTIALS.map((c, i) => (
                <button
                  key={c.username}
                  type="button"
                  onClick={() => { setUsername(c.username); setPin(c.pin); pinRef.current?.focus() }}
                  className="flex flex-col items-center justify-center h-16 rounded-md border border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-alt)] hover:border-[var(--color-brand)] transition-colors"
                  title={`${c.username} / ${c.pin}`}
                >
                  <span className="text-[20px] font-bold text-[var(--color-ink)] tabular-nums leading-none">{i + 1}</span>
                  <span className="text-[10px] font-medium text-[var(--color-ink-3)] mt-1">PIN {c.pin}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
