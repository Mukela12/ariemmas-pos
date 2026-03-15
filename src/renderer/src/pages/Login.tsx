import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

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
      {/* Left — brand panel */}
      <div className="hidden lg:flex w-[44%] bg-[#18181B] flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle teal glow */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-100"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.12) 0%, transparent 70%)' }} />

        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center border border-white/[0.06] overflow-hidden">
            <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <div className="text-base font-semibold text-[#FAFAFA] tracking-tight">Ariemmas</div>
            <div className="text-[11px] text-[#71717A]">Point of Sale</div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10">
          <h1 className="text-[32px] font-semibold text-[#FAFAFA] leading-[1.15] tracking-tight">
            Manage your<br />shop with<br />
            <span className="text-[#2DD4BF]">precision.</span>
          </h1>
          <p className="text-[13px] text-[#71717A] mt-3 leading-relaxed max-w-[280px]">
            Fast checkout, accurate inventory, real-time tracking — built for Zambian retail.
          </p>
          <div className="flex gap-8 mt-8">
            {[{ v: '25+', l: 'Products' }, { v: '<2s', l: 'Receipts' }, { v: '100%', l: 'Offline' }].map(s => (
              <div key={s.l}>
                <div className="text-xl font-semibold text-[#FAFAFA] tabular-nums">{s.v}</div>
                <div className="text-[11px] text-[#52525B] mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-[#3F3F46]">
          Independence Ave, Mongu &middot; 097 4542233
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-[340px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-[#18181B] flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <div className="text-base font-semibold text-[#18181B]">Ariemmas</div>
              <div className="text-[11px] text-[#71717A]">Point of Sale</div>
            </div>
          </div>

          <h2 className="text-[22px] font-semibold text-[#18181B] tracking-tight">Welcome back</h2>
          <p className="text-[13px] text-[#71717A] mt-1">Sign in to start your shift</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Username</label>
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-10 px-3 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pinRef.current?.focus() } }}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">PIN</label>
              <div className="relative">
                <input
                  ref={pinRef}
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full h-10 px-3 pr-10 rounded-md border border-[#E4E4E7] bg-white text-sm text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08] tracking-[0.15em]"
                />
                <button type="button" onClick={() => setShowPin(!showPin)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#52525B]">
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-[#FEF2F2] border border-[#FECACA]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                <p className="text-[13px] text-[#DC2626]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !pin.trim()}
              className="w-full h-10 rounded-md bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? <><Loader2 size={15} className="animate-spin" />Signing in...</> : 'Sign In'}
            </button>
          </form>

          {/* Credentials hint */}
          <div className="mt-8 p-3.5 rounded-md bg-[#F4F4F5] border border-[#E4E4E7]">
            <div className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.06em] mb-2">Demo Credentials</div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[#71717A]">Admin</span>
                <code className="text-[12px] font-mono text-[#3F3F46] bg-white px-2 py-0.5 rounded border border-[#E4E4E7]">admin / 1234</code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[#71717A]">Cashier</span>
                <code className="text-[12px] font-mono text-[#3F3F46] bg-white px-2 py-0.5 rounded border border-[#E4E4E7]">mary / 5678</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
