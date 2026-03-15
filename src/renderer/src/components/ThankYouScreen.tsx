import { useEffect, useState } from 'react'
import { useRive } from '@rive-app/react-canvas'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

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

export function ThankYouScreen({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(true)

  const { RiveComponent } = useRive({
    src: '/shopping-cart.riv',
    autoplay: true,
  })

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  // Allow Escape key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setVisible(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Call onClose after exit animation
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(onClose, 400)
      return () => clearTimeout(timer)
    }
  }, [visible, onClose])

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
          style={{ background: 'radial-gradient(ellipse at center, #F0FDFA 0%, #CCFBF1 40%, #99F6E4 100%)' }}
        >
          {/* Close button — always accessible */}
          <button
            onClick={(e) => { e.stopPropagation(); setVisible(false) }}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-[#71717A] hover:text-[#18181B] hover:bg-white shadow-sm transition-colors"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>

          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Rive Animation */}
            <div className="w-[180px] h-[180px] mb-6">
              <RiveComponent />
            </div>

            {/* Checkmark pulse */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
              className="w-16 h-16 rounded-full bg-[#0D9488] flex items-center justify-center mb-6 shadow-lg shadow-[#0D9488]/30"
            >
              <motion.svg
                width="32" height="32" viewBox="0 0 24 24" fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                />
              </motion.svg>
            </motion.div>

            {/* Shimmer text */}
            <h1 className="text-[28px] font-bold text-[#0F766E] mb-2 leading-tight">
              <ShimmerText text="Thank You!" />
            </h1>
            <p className="text-[15px] text-[#0D9488] font-medium mb-1">
              <ShimmerText text="For shopping with us" />
            </p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-xs text-[#5EEAD4] mt-4"
            >
              Tap anywhere or press Esc to close
            </motion.p>

            {/* Decorative floating dots */}
            {BRAND_COLORS.map((color, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 8 + i * 4,
                  height: 8 + i * 4,
                  background: color,
                  opacity: 0.3,
                  left: `${15 + i * 17}%`,
                  top: `${20 + (i % 3) * 25}%`,
                }}
                animate={{
                  y: [0, -15, 0],
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{
                  duration: 2 + i * 0.3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.4,
                }}
              />
            ))}
          </motion.div>

          {/* Shimmer keyframes injected via style tag */}
          <style>{`
            @keyframes shimmer {
              0%, 100% { color: #0D9488; transform: translateY(0); }
              25% { color: #0F766E; }
              50% { color: #14B8A6; transform: translateY(-2px); }
              75% { color: #2DD4BF; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
