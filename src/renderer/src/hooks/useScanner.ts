import { useEffect, useRef } from 'react'

interface UseScannerOptions {
  onScan: (barcode: string) => void
  enabled?: boolean
  minLength?: number
  maxDelay?: number
}

export function useScanner({ onScan, enabled = true, minLength = 4, maxDelay = 60 }: UseScannerOptions): void {
  const bufferRef = useRef('')
  const lastKeyRef = useRef(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      const isSearchInput = target.getAttribute('data-scanner') === 'true'

      if (isInput && !isSearchInput) return

      const now = Date.now()

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault()
          onScanRef.current(bufferRef.current)
        }
        bufferRef.current = ''
        return
      }

      if (e.key.length !== 1) return

      if (now - lastKeyRef.current > maxDelay && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      bufferRef.current += e.key
      lastKeyRef.current = now
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, minLength, maxDelay])
}
