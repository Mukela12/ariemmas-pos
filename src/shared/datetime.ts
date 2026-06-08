// Mongu, Zambia runs on Central Africa Time (CAT, UTC+2, no daylight saving).
// SQLite stores timestamps as bare UTC strings ("YYYY-MM-DD HH:MM:SS" with no
// zone), which JS would otherwise parse in the machine's local zone and render
// 2 hours off. We treat a bare timestamp as UTC and always format in CAT so the
// receipt time matches the wall clock in the shop regardless of the PC's zone.
const MONGU_TZ = 'Africa/Maputo' // CAT (UTC+2), shares Zambia's offset

function toDate(ts: string): Date {
  // Bare SQLite timestamp (no T, no zone) -> interpret as UTC.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(ts) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) {
    return new Date(ts.replace(' ', 'T') + 'Z')
  }
  return new Date(ts)
}

/** Format a timestamp as "DD/MM/YYYY, HH:MM:SS" in Mongu (CAT) time. */
export function formatMonguDateTime(ts: string): string {
  const d = toDate(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString('en-GB', {
    timeZone: MONGU_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}
