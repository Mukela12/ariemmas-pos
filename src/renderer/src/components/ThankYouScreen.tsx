import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { formatZMW } from '../lib/currency'

const BRAND_COLORS = ['#0D9488', '#0F766E', '#14B8A6', '#2DD4BF', '#5EEAD4']

function ShimmerText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-block ${className || ''}`}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            animation: `shimmer 2.5s ease-in-out infinite`,
            animationDelay: `${i * 0.07}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}

interface ThankYouProps {
  onClose: () => void
  paymentMethod?: 'cash' | 'mobile_money'
  total?: number
  amountTendered?: number | null
  changeGiven?: number | null
}

export function ThankYouScreen({ onClose, paymentMethod, total, amountTendered, changeGiven }: ThankYouProps) {
  const [visible, setVisible] = useState(true)

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  // Allow Escape key to close (delay listener to avoid catching Enter from payment modal)
  useEffect(() => {
    let active = false
    const enableTimer = setTimeout(() => { active = true }, 500)
    const handleKey = (e: KeyboardEvent) => {
      if (!active) return
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setVisible(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => { clearTimeout(enableTimer); window.removeEventListener('keydown', handleKey) }
  }, [])

  // Call onClose after exit animation
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(onClose, 400)
      return () => clearTimeout(timer)
    }
  }, [visible, onClose])

  const showCashDetails = paymentMethod === 'cash' && amountTendered != null && changeGiven != null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setVisible(false)}
          style={{ background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 40%, #134E4A 100%)' }}
        >
          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); setVisible(false) }}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white/60 hover:text-white hover:bg-white/25 shadow-sm transition-colors"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>

          {/* Decorative floating dots */}
          {BRAND_COLORS.map((color, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 8 + i * 4,
                height: 8 + i * 4,
                background: color,
                opacity: 0.15,
                left: `${15 + i * 17}%`,
                top: `${20 + (i % 3) * 25}%`,
              }}
              animate={{
                y: [0, -15, 0],
                opacity: [0.1, 0.25, 0.1],
              }}
              transition={{
                duration: 2 + i * 0.3,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.4,
              }}
            />
          ))}

          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Checkmark pulse */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
              className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-6 shadow-lg ring-2 ring-white/30"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 15 }}
              >
                <Check size={40} className="text-white" strokeWidth={3} />
              </motion.div>
            </motion.div>

            {/* Shimmer text */}
            <h1 className="text-[42px] font-bold text-white mb-2 leading-tight drop-shadow-md">
              <ShimmerText text="Thank You!" />
            </h1>
            <p className="text-[18px] text-white/80 font-medium mb-5">
              <ShimmerText text="For shopping with us" />
            </p>

            {/* Payment summary */}
            {total != null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-3 mb-4 border border-white/20 min-w-[220px]"
              >
                <div className="flex justify-between items-center gap-6 mb-1">
                  <span className="text-white/60 text-sm">Total</span>
                  <span className="text-white font-semibold text-lg tabular-nums">{formatZMW(total)}</span>
                </div>
                {showCashDetails && (
                  <>
                    <div className="flex justify-between items-center gap-6 mb-1">
                      <span className="text-white/60 text-sm">Paid</span>
                      <span className="text-white/90 font-medium tabular-nums">{formatZMW(amountTendered!)}</span>
                    </div>
                    <div className="h-px bg-white/20 my-1" />
                    <div className="flex justify-between items-center gap-6">
                      <span className="text-[#5EEAD4] text-sm font-medium">Change</span>
                      <span className="text-[#5EEAD4] font-bold text-lg tabular-nums">{formatZMW(changeGiven!)}</span>
                    </div>
                  </>
                )}
                {paymentMethod === 'mobile_money' && (
                  <div className="text-white/50 text-xs text-center mt-1">Paid via Mobile Money</div>
                )}
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-xs text-white/40 mt-2"
            >
              Tap anywhere or press Esc to close
            </motion.p>
          </motion.div>

          {/* Shimmer keyframes */}
          <style>{`
            @keyframes shimmer {
              0%, 100% { color: #ffffff; transform: translateY(0); }
              25% { color: #5EEAD4; }
              50% { color: #2DD4BF; transform: translateY(-2px); }
              75% { color: #99F6E4; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
