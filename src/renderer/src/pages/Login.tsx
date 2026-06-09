import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Eye, EyeOff, Loader2, User as UserIcon, KeyRound } from 'lucide-react'
import { AnimatedGridPattern } from '../components/ui/AnimatedGridPattern'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { NumberKeypad } from '../components/NumberKeypad'
import { isElectron } from '../lib/productImage'
import logoUrl from '../assets/logo.png'

export function Login() {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [activeField, setActiveField] = useState<'username' | 'pin' | null>(null)
  const navigate = useNavigate()
  const { login, isLoading, error } = useAuthStore()

  const canSubmit = username.trim().length > 0 && pin.trim().length > 0

  const doLogin = async () => {
    if (!canSubmit || isLoading) return
    setActiveField(null)
    const success = await login(username.trim().toLowerCase(), pin)
    if (success) navigate('/')
  }

  const fieldBase =
    'w-full h-12 px-3 rounded-[2px] border bg-white text-[15px] text-left flex items-center gap-2.5 transition-colors'
  const fieldActive = 'border-[#0D9488] ring-[3px] ring-[#0D9488]/[0.08]'
  const fieldIdle = 'border-[#E4E4E7] hover:border-[#A1A1AA]'

  return (
    <div className="h-screen w-screen flex bg-white overflow-hidden">
      {/* Left — brand panel with animated grid */}
      <div className="graphite hidden lg:flex w-[44%] flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)' }} />
        <AnimatedGridPattern numSquares={30} maxOpacity={0.15} duration={3} width={50} height={50} className="text-teal-500/40" />
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 rounded-[3px] bg-white/[0.08] flex items-center justify-center border border-white/[0.06] mx-auto mb-6 overflow-hidden">
            <img src={logoUrl} alt="" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-[42px] font-bold text-[#FAFAFA] tracking-tight leading-none">Ariemmas</h1>
          <div className="text-sm font-medium text-[#2DD4BF] mt-2 tracking-[0.2em] uppercase">Point of Sale</div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-8 bg-white">
        <div className="w-full max-w-[360px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-[3px] bg-[#18181B] flex items-center justify-center overflow-hidden">
              <img src={logoUrl} alt="" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <div className="text-base font-semibold text-[#18181B]">Ariemmas</div>
              <div className="text-[11px] text-[#71717A]">Point of Sale</div>
            </div>
          </div>

          <h2 className="text-[22px] font-semibold text-[#18181B] tracking-tight">Welcome back</h2>
          <p className="text-[13px] text-[#71717A] mt-1">Sign in to start your shift</p>

          <form onSubmit={(e) => { e.preventDefault(); doLogin() }} className="mt-8 space-y-5">
            {/* Username — native input on web, tap-to-keypad on the Electron till */}
            <div>
              <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">Username</label>
              {isElectron ? (
                <button type="button" onClick={() => setActiveField('username')}
                  className={`${fieldBase} ${activeField === 'username' ? fieldActive : fieldIdle}`}>
                  <UserIcon size={16} className="text-[#A1A1AA] shrink-0" />
                  {username ? <span className="text-[#18181B]">{username}</span> : <span className="text-[#A1A1AA]">Tap to enter your username</span>}
                </button>
              ) : (
                <div className={`${fieldBase} ${fieldIdle} focus-within:border-[#0D9488] focus-within:ring-[3px] focus-within:ring-[#0D9488]/[0.08]`}>
                  <UserIcon size={16} className="text-[#A1A1AA] shrink-0" />
                  <input type="text" autoFocus autoComplete="username" spellCheck={false}
                    value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="flex-1 bg-transparent outline-none text-[15px] text-[#18181B] placeholder:text-[#A1A1AA]" />
                </div>
              )}
            </div>

            {/* PIN — native input on web (digits only, masked), tap-to-keypad on the till */}
            <div>
              <label className="block text-[11px] font-semibold text-[#71717A] uppercase tracking-[0.06em] mb-1.5">PIN</label>
              <div className="relative">
                {isElectron ? (
                  <button type="button" onClick={() => setActiveField('pin')}
                    className={`${fieldBase} pr-10 ${activeField === 'pin' ? fieldActive : fieldIdle}`}>
                    <KeyRound size={16} className="text-[#A1A1AA] shrink-0" />
                    {pin
                      ? <span className="text-[#18181B] tracking-[0.3em]">{showPin ? pin : '•'.repeat(pin.length)}</span>
                      : <span className="text-[#A1A1AA]">Tap to enter your PIN</span>}
                  </button>
                ) : (
                  <div className={`${fieldBase} pr-10 ${fieldIdle} focus-within:border-[#0D9488] focus-within:ring-[3px] focus-within:ring-[#0D9488]/[0.08]`}>
                    <KeyRound size={16} className="text-[#A1A1AA] shrink-0" />
                    <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password"
                      maxLength={6} value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="PIN"
                      className="flex-1 bg-transparent outline-none text-[15px] tracking-[0.3em] text-[#18181B] placeholder:text-[#A1A1AA] placeholder:tracking-normal" />
                  </div>
                )}
                {pin.length > 0 && (
                  <button type="button" onClick={() => setShowPin(!showPin)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#52525B]">
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[2px] bg-[#FEF2F2] border border-[#FECACA]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                <p className="text-[13px] text-[#DC2626]">{error}</p>
              </div>
            )}

            <button type="submit" disabled={isLoading || !canSubmit}
              className="w-full h-11 rounded-[2px] bg-[#18181B] text-white text-sm font-semibold hover:bg-[#27272A] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isLoading ? <><Loader2 size={15} className="animate-spin" />Signing in...</> : 'Sign In'}
            </button>

            <p className="text-[12px] text-[#A1A1AA] text-center">Forgot your login? Ask your supervisor.</p>
          </form>
        </div>
      </div>

      {/* On-screen keyboards — only on the Electron till (web uses the device's own keyboard). */}
      {isElectron && activeField === 'username' && (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <OnScreenKeyboard
            value={username}
            onChange={(v) => setUsername(v)}
            onEnter={() => setActiveField('pin')}
            onClose={() => setActiveField(null)}
          />
        </div>
      )}
      {isElectron && activeField === 'pin' && (
        <div className="fixed inset-x-0 bottom-0 z-50 graphite border-t border-[var(--color-graphite-line)] px-3 py-3">
          <div className="max-w-[300px] mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-white/65 uppercase tracking-wide">Enter your PIN</span>
              <button onClick={() => setActiveField(null)} className="text-[13px] font-semibold text-white/70 hover:text-white px-2">Done</button>
            </div>
            <NumberKeypad
              value={pin}
              onChange={(v) => setPin(v)}
              onEnter={doLogin}
              enterLabel={isLoading ? '…' : 'SIGN IN'}
              enterTone="teal"
              enterDisabled={!canSubmit || isLoading}
              maxLength={6}
            />
          </div>
        </div>
      )}
    </div>
  )
}
