import { Delete } from 'lucide-react'

interface NumberKeypadProps {
  value: string
  onChange: (next: string) => void
  onEnter?: () => void
  enterLabel?: string
  enterDisabled?: boolean
  decimal?: boolean
  maxLength?: number
  /** 'graphite' (black keys) or 'light' (white keys) */
  variant?: 'graphite' | 'light'
}

/**
 * On-screen numeric keypad for the touchscreen till, so cashiers never have to
 * summon the Windows keyboard. Pure number entry — digits, optional decimal,
 * backspace and clear. The parent owns the value (a string) and decides what
 * the optional Enter key does.
 */
export function NumberKeypad({
  value,
  onChange,
  onEnter,
  enterLabel = 'Enter',
  enterDisabled = false,
  decimal = true,
  maxLength = 12,
  variant = 'graphite'
}: NumberKeypadProps) {
  const press = (digit: string) => {
    if (digit === '.' ) {
      if (!decimal || value.includes('.')) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    if (value.length >= maxLength) return
    // avoid leading zeros like "00"
    if (value === '0' && digit !== '.') { onChange(digit); return }
    onChange(value + digit)
  }
  const backspace = () => onChange(value.slice(0, -1))
  const clear = () => onChange('')

  const keyBase = variant === 'graphite'
    ? 'keypad-key'
    : 'bg-white border border-[#E4E4E7] rounded-[4px] text-[#18181B] font-semibold tabular-nums hover:bg-[#F4F4F5] active:bg-[#E4E4E7] active:translate-y-px transition select-none'

  const Digit = ({ d }: { d: string }) => (
    <button type="button" onClick={() => press(d)} className={`${keyBase} h-14 text-[22px]`}>
      {d}
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => <Digit key={d} d={d} />)}
        <button
          type="button"
          onClick={() => press('.')}
          disabled={!decimal}
          className={`${keyBase} h-14 text-[22px] disabled:opacity-30`}
        >
          .
        </button>
        <Digit d="0" />
        <button type="button" onClick={backspace} className={`${keyBase} h-14 flex items-center justify-center`} aria-label="Backspace">
          <Delete size={22} />
        </button>
      </div>
      <div className={onEnter ? 'grid grid-cols-2 gap-2' : ''}>
        <button
          type="button"
          onClick={clear}
          className={`${keyBase} h-12 text-[15px] uppercase tracking-wide`}
        >
          Clear
        </button>
        {onEnter && (
          <button
            type="button"
            onClick={onEnter}
            disabled={enterDisabled}
            className="btn-pay h-12 text-[15px] uppercase tracking-wide"
          >
            {enterLabel}
          </button>
        )}
      </div>
    </div>
  )
}
