import { useEffect, useRef, useState } from 'react'
import { X as XIcon, Camera, AlertCircle, ScanLine } from 'lucide-react'

interface Props {
  onResult: (barcode: string) => void
  onClose: () => void
}

/** Browser native BarcodeDetector availability + a hint message. */
export function isBarcodeScannerSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).BarcodeDetector === 'function'
}

/**
 * Camera-based barcode scan modal for the web app (phones/tablets). Uses the
 * browser-native BarcodeDetector — supported on Chromium / Chrome Android / Edge.
 * On Safari / unsupported browsers, shows a clear fall-back message; USB barcode
 * scanners type into the native input directly, so no integration is needed there.
 */
export function BarcodeScanModal({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const stoppedRef = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null

    async function start(): Promise<void> {
      const Detector = (window as any).BarcodeDetector
      if (!Detector) {
        setError("This browser doesn't support camera scanning. Use a USB barcode scanner (it types straight into the box), or type the code by hand.")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
        // Common retail formats: EAN-8/13 + UPC-A/E for shop products; Code-128
        // and Code-39 for internal labels; QR for completeness.
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        })
        timer = setInterval(async () => {
          if (stoppedRef.current || !videoRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              stoppedRef.current = true
              if (timer) clearInterval(timer)
              if (stream) stream.getTracks().forEach((t) => t.stop())
              onResult(String(barcodes[0].rawValue))
            }
          } catch {
            // ignore per-frame detect errors; keep trying
          }
        }, 350)
      } catch (e: any) {
        const msg = String(e?.message || e?.name || '')
        if (/Permission|NotAllowed/i.test(msg)) {
          setError('Camera permission denied. Allow camera access in your browser settings and try again.')
        } else if (/NotFound/i.test(msg)) {
          setError('No camera found on this device.')
        } else {
          setError("Could not start the camera. Try a different browser, or type the barcode by hand.")
        }
      }
    }

    start()
    return () => {
      stoppedRef.current = true
      if (timer) clearInterval(timer)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
    // onResult is stable enough at call sites; including it would re-mount the camera mid-scan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] bg-white rounded-[3px] shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="graphite px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Camera size={16} />
            <h2 className="text-[15px] font-semibold">Scan barcode</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-[2px] flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10">
            <XIcon size={16} />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="flex items-start gap-2 px-3 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[2px]">
              <AlertCircle size={16} className="text-[#DC2626] shrink-0 mt-0.5" />
              <p className="text-[13px] text-[#DC2626] leading-snug">{error}</p>
            </div>
          ) : (
            <>
              <div className="relative bg-black rounded-[2px] overflow-hidden aspect-[4/3]">
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                {/* Aim guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[78%] h-[28%] border-2 border-[#0D9488] rounded-[2px] flex items-center justify-center">
                    <ScanLine size={32} className="text-[#0D9488]/70 animate-pulse" />
                  </div>
                </div>
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center text-white text-[13px]">Starting camera…</div>
                )}
              </div>
              <p className="text-[12px] text-[#71717A] mt-3 text-center">
                Point the camera at the barcode. It fills the field automatically.
              </p>
            </>
          )}
          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="h-9 px-4 rounded-[2px] border border-[#E4E4E7] text-[13px] font-medium text-[#52525B] hover:bg-[#F4F4F5]">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
