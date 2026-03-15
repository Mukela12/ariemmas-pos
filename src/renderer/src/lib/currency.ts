export function formatZMW(amount: number | string): string {
  return `K ${Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatNumber(amount: number | string): string {
  return Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
