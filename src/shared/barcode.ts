// Equivalent spellings of a scanned/typed barcode, exact code first.
//
// Scanners and hand-typed entries disagree about leading zeros: the same
// product can arrive as UPC-A (12 digits) from one scanner and as EAN-13
// (0 + the same 12 digits) from another, and staff typing the digits printed
// under the bars often drop leading zeros entirely. The catalog has both
// spellings saved (94 products with 12 digits, 174 with 13), so an exact-match
// lookup randomly fails depending on which side normalized. Try them all.
export function barcodeCandidates(raw: string): string[] {
  const code = (raw || '').trim()
  if (!code) return []
  const out = [code]
  if (/^\d+$/.test(code)) {
    if (code.length === 12) out.push('0' + code) // UPC-A scanned, saved as EAN-13
    if (code.length === 13 && code.startsWith('0')) out.push(code.slice(1)) // EAN-13 scanned, saved as UPC-A
    const bare = code.replace(/^0+/, '')
    if (bare && bare !== code) out.push(bare) // typed without leading zeros
  }
  return [...new Set(out)]
}
