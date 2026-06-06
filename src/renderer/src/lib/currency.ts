export function formatZMW(amount: number | string): string {
  return `K ${Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatNumber(amount: number | string): string {
  return Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Stock can be a whole count (each items) or a fraction (kg for weighted items).
// Show whole numbers without decimals, fractions with up to 3 trimmed decimals,
// so a Postgres NUMERIC like "24.550" reads as "24.55" and "120.000" as "120".
export function formatStock(amount: number | string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return String(amount)
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(3).replace(/\.?0+$/, '')
}
