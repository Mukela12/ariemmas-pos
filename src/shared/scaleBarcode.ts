// Parser for in-store "variable-price" barcodes printed by the label-printing
// scale. Confirmed format on the Ariemmas scale (V3.04A firmware):
//
//   2 │ P P P P P P │ V V V V V │ C
//   │   └ PLU (6)     └ price     └ EAN-13 check digit
//   └ in-store flag             (5 digits, total price in ngwee/cents)
//
// e.g.  2 000001 02020 3  ->  PLU 1, price K20.20  (verified against real labels).
//
// The price encoded is the TOTAL the scale calculated (price/kg × weight), so
// the till charges exactly what's printed on the label. Weight is derived for
// display/inventory from total ÷ the product's price-per-kg.

export interface ScaleBarcode {
  plu: number
  /** Total price in Kwacha (already divided from ngwee). */
  price: number
}

/** Standard EAN-13 check digit for the first 12 digits. */
function ean13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = first12.charCodeAt(i) - 48
    sum += i % 2 === 0 ? d : d * 3
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Parse a scanned code as a scale label. Returns null if it's not a 13-digit
 * in-store barcode (flag 2) or the check digit is wrong (corrupt scan) — callers
 * then fall back to a normal product-barcode lookup.
 */
export function parseScaleBarcode(raw: string): ScaleBarcode | null {
  const code = (raw || '').trim()
  if (!/^\d{13}$/.test(code)) return null
  if (code[0] !== '2') return null // only in-store flag-2 codes are scale labels

  if (ean13CheckDigit(code.slice(0, 12)) !== code.charCodeAt(12) - 48) return null

  const plu = parseInt(code.slice(1, 7), 10) // positions 2..7
  const priceNgwee = parseInt(code.slice(7, 12), 10) // positions 8..12
  if (!plu) return null

  return { plu, price: priceNgwee / 100 }
}
