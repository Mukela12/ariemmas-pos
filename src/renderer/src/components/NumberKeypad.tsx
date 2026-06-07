import { Delete } from 'lucide-react'

interface NumberKeypadProps {
  value: string
  onChange: (next: string) => void
  onEnter?: () => void
  enterLabel?: string
  enterDisabled?: boolean
  /** Colour of the tall enter key: 'pay' (green) or 'teal' */
  enterTone?: 'pay' | 'teal'
  decimal?: boolean
  maxLength?: number
}

/**
 * On-screen numeric keypad for the touchscreen till, so cashiers never need the
 * Windows keyboard. Laid out like an enterprise POS: a 4-column grid with grey
 * backspace + CLR utility keys down the right, and a tall coloured ENTER key
 * that performs the screen's primary action (Pay / Add / Open shift).
 */
export function NumberKeypad({
  value,
  onChange,
  onEnter,
  enterLabel = 'Enter',
  enterDisabled = false,
  enterTone = 'pay',
  decimal = true,
  maxLength = 12
}: NumberKeypadProps) {
  const press = (digit: string) => {
    if (digit === '.') {
      if (!decimal || value.includes('.')) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }
    if (value.length >= maxLength) return
    if (value === '0') { onChange(digit); return } // no leading zeros
    onChange(value + digit)
  }
  const backspace = () => onChange(value.slice(0, -1))
  const clear = () => onChange('')

  const Digit = ({ d, col, row, span }: { d: string; col: number; row: number; span?: number }) => (
    <button
      type="button"
      onClick={() => press(d)}
      style={{ gridColumn: span ? `${col} / span ${span}` : col, gridRow: row }}
      className="keypad-key h-[52px] text-[22px]"
    >
      {d}
    </button>
  )

  const enterClass = enterTone === 'teal' ? 'btn-teal' : 'btn-pay'

  return (
    <div className="grid grid-cols-4 gap-2" style={{ gridTemplateRows: 'repeat(4, 52px)' }}>
      <Digit d="7" col={1} row={1} /><Digit d="8" col={2} row={1} /><Digit d="9" col={3} row={1} />
      <button type="button" onClick={backspace} aria-label="Backspace"
        style={{ gridColumn: 4, gridRow: 1 }}
        className="keypad-util flex items-center justify-center">
        <Delete size={20} />
      </button>

      <Digit d="4" col={1} row={2} /><Digit d="5" col={2} row={2} /><Digit d="6" col={3} row={2} />
      <button type="button" onClick={clear}
        style={{ gridColumn: 4, gridRow: 2 }}
        className="keypad-util text-[14px] font-bold uppercase tracking-wide">
        CLR
      </button>

      <Digit d="1" col={1} row={3} /><Digit d="2" col={2} row={3} /><Digit d="3" col={3} row={3} />
      {onEnter ? (
        <button type="button" onClick={onEnter} disabled={enterDisabled}
          style={{ gridColumn: 4, gridRow: '3 / span 2' }}
          className={`${enterClass} flex flex-col items-center justify-center text-[14px] font-bold uppercase tracking-wide leading-tight`}>
          {enterLabel}
        </button>
      ) : (
        <button type="button" onClick={backspace} aria-label="Backspace"
          style={{ gridColumn: 4, gridRow: '3 / span 2' }}
          className="keypad-util flex items-center justify-center">
          <Delete size={20} />
        </button>
      )}

      <Digit d="0" col={1} row={4} span={2} />
      <button type="button" onClick={() => press('.')} disabled={!decimal}
        style={{ gridColumn: 3, gridRow: 4 }}
        className="keypad-key text-[22px] disabled:opacity-30">
        .
      </button>
    </div>
  )
}
