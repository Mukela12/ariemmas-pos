import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { AnimatedGridPattern } from '../components/ui/AnimatedGridPattern'

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
      {/* Left — brand panel with animated grid */}
      <div className="hidden lg:flex w-[44%] bg-[#18181B] flex-col items-center justify-center relative overflow-hidden">
        {/* Teal glow accents */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-100"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-100"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)' }} />

        {/* Animated grid pattern */}
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.15}
          duration={3}
          width={50}
          height={50}
          className="text-teal-500/40"
        />

        {/* Brand text */}
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.08] flex items-center justify-center border border-white/[0.06] mx-auto mb-6 overflow-hidden">
            <img src="/logo.png" alt="" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-[42px] font-bold text-[#FAFAFA] tracking-tight leading-none">
            Ariemmas
          </h1>
          <div className="text-sm font-medium text-[#2DD4BF] mt-2 tracking-[0.2em] uppercase">
            Point of Sale
          </div>
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
