// Numbers the way Bangladeshi finance teams read them: lakh and crore, with ৳.

const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function bdt(n: number) {
  if (Math.abs(n) >= 1e7) return `৳${(n / 1e7).toFixed(2)} crore`
  if (Math.abs(n) >= 1e5) return `৳${(n / 1e5).toFixed(1)} lakh`
  return `৳${grouped.format(n)}`
}

export const int = (n: number) => grouped.format(n)
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`
export const hours = (n: number) => (n >= 48 ? `${(n / 24).toFixed(1)} days` : `${n.toFixed(1)} h`)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (key: string) => `${MONTHS[+key.slice(5) - 1]} ${key.slice(2, 4)}`
export function dateLabel(ms: number) {
  const d = new Date(ms + 6 * 3_600_000)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
