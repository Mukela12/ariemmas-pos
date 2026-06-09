import { useId, useRef, useEffect } from 'react'
import { useKeyboardStore } from '../stores/keyboardStore'
import { OnScreenKeyboard } from './OnScreenKeyboard'
import { NumberKeypad } from './NumberKeypad'
import { isElectron } from '../lib/productImage'

interface Props {
  value: string
  onChange: (v: string) => void
  /** text = full letters+numbers keyboard; numeric/decimal = number keypad. */
  mode?: 'text' | 'numeric' | 'decimal'
  placeholder?: string
  className?: string
  maxLength?: number
  /** Heading shown above the number keypad. */
  title?: string
  mono?: boolean
  disabled?: boolean
}

/**
 * A tappable field that brings up the in-app on-screen keyboard (no Windows
 * keyboard needed): the number keypad for numeric/decimal fields, the full
 * QWERTY keyboard for text. Drop-in replacement for <input> on the touch UI —
 * pass the same className so it matches the surrounding form.
 */
export function TouchInput({ value, onChange, mode = 'text', placeholder, className = '', maxLength, title, mono, disabled }: Props) {
  const id = useId()
  const activeId = useKeyboardStore((s) => s.activeId)
  const setActive = useKeyboardStore((s) => s.setActive)
  const active = activeId === id && !disabled
  const ref = useRef<HTMLButtonElement>(null)
  const isNum = mode !== 'text'

  // Hooks must run on every render — keep them above any conditional return.
  useEffect(() => {
    if (active && isElectron) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])
  useEffect(() => () => {
    if (isElectron && useKeyboardStore.getState().activeId === id) setActive(null)
  }, [id, setActive])

  // ---- WEB (laptop/phone/tablet): native <input>. The device's own keyboard
  // handles it; USB barcode scanners type straight in; inputMode hints the
  // numeric pad on touch devices.
  if (!isElectron) {
    const inputMode = mode === 'numeric' ? 'numeric' : mode === 'decimal' ? 'decimal' : 'text'
    return (
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        title={title}
        className={`${className} disabled:opacity-50 disabled:bg-[#F4F4F5] disabled:cursor-not-allowed ${mono ? 'font-mono' : ''} focus:outline-none focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/[0.08]`}
      />
    )
  }
  // ---- DESKTOP (Electron till): tap-to-open in-app keypad/keyboard.

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setActive(active ? null : id)}
        className={`${className} text-left flex items-center overflow-hidden disabled:opacity-50 disabled:bg-[#F4F4F5] disabled:cursor-not-allowed ${mono ? 'font-mono' : ''} ${active ? '!border-[#0D9488] ring-[3px] ring-[#0D9488]/[0.08]' : ''}`}
      >
        {value
          ? <span className="truncate">{value}</span>
          : <span className="text-[#A1A1AA] truncate">{placeholder || ''}</span>}
      </button>

      {active && (isNum ? (
        <div className="fixed inset-x-0 bottom-0 z-[70] graphite border-t border-[var(--color-graphite-line)] px-3 py-3">
          <div className="max-w-[320px] mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-white/65 uppercase tracking-wide truncate">{title || 'Enter number'}</span>
              <button type="button" onClick={() => setActive(null)} className="text-[13px] font-semibold text-white/70 hover:text-white px-2">Done</button>
            </div>
            <NumberKeypad
              value={value}
              onChange={onChange}
              onEnter={() => setActive(null)}
              enterLabel="DONE"
              enterTone="teal"
              decimal={mode === 'decimal'}
              maxLength={maxLength}
            />
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-[70]">
          <OnScreenKeyboard
            value={value}
            onChange={onChange}
            onEnter={() => setActive(null)}
            onClose={() => setActive(null)}
          />
        </div>
      ))}
    </>
  )
}
