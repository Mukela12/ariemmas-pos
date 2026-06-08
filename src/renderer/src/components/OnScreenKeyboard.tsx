import { Delete, ArrowBigUp } from 'lucide-react'
import { useState } from 'react'

interface Props {
  value: string
  onChange: (next: string) => void
  onEnter?: () => void
  onClose?: () => void
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
]

/**
 * Full on-screen touch keyboard for the till, so cashiers can search products
 * (by name or barcode) without summoning the Windows keyboard. Graphite keys
 * to match the design language.
 */
export function OnScreenKeyboard({ value, onChange, onEnter, onClose }: Props) {
  const [caps, setCaps] = useState(false)
  const tap = (k: string) => onChange(value + (caps ? k.toUpperCase() : k))

  return (
    <div className="graphite border-t border-[var(--color-graphite-line)] px-2 py-2 select-none">
      <div className="max-w-[760px] mx-auto space-y-1.5">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {ri === 3 && (
              <button onClick={() => setCaps((c) => !c)} aria-label="Shift"
                className={`keypad-util h-11 px-3 flex items-center justify-center ${caps ? 'ring-2 ring-[#2DD4BF]' : ''}`}>
                <ArrowBigUp size={18} />
              </button>
            )}
            {row.map((k) => (
              <button key={k} onClick={() => tap(k)}
                className="keypad-key h-11 flex-1 min-w-[34px] text-[17px]">
                {caps ? k.toUpperCase() : k}
              </button>
            ))}
            {ri === 3 && (
              <button onClick={() => onChange(value.slice(0, -1))} aria-label="Backspace"
                className="keypad-util h-11 px-3 flex items-center justify-center">
                <Delete size={18} />
              </button>
            )}
          </div>
        ))}
        <div className="flex justify-center gap-1.5">
          <button onClick={() => onChange('')} className="keypad-util h-11 px-4 text-[13px] font-bold uppercase tracking-wide">Clear</button>
          <button onClick={() => onChange(value + '@')} className="keypad-key h-11 px-3.5 text-[17px]">@</button>
          <button onClick={() => onChange(value + '.')} className="keypad-key h-11 px-3.5 text-[17px]">.</button>
          <button onClick={() => tap(' ')} className="keypad-key h-11 flex-1 max-w-[280px] text-[13px]">space</button>
          <button onClick={() => (onEnter ? onEnter() : onClose?.())} className="btn-teal h-11 px-5 text-[13px] font-bold uppercase tracking-wide">Done</button>
        </div>
      </div>
    </div>
  )
}
