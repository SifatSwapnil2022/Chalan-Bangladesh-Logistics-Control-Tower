// Every number on screen is computed here, from the shipment records, with the same rules as the
// SQL views (analytics/sql/02_views.sql) and the DAX measures (analytics/powerbi/DAX_MEASURES.md):
// performance is counted on the delivery date, and only delivered shipments are scored.
import type { View } from '../state/view'
import { DAY, NOW, type Shipment } from './generate'

export const OTD_TARGET = 90
export const PERIODS = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '12m', label: '12 months', days: 365 },
  { id: '18m', label: '18 months', days: 543 },
] as const
export const periodDays = (p: View['period']) => PERIODS.find((x) => x.id === p)!.days
export const periodLabel = (p: View['period']) => PERIODS.find((x) => x.id === p)!.label

export const totalCost = (s: Shipment) => s.freightBdt + s.surchargeBdt + s.handlingBdt
export const isDone = (s: Shipment) => s.status === 'on_time' || s.status === 'late'
export const isOpen = (s: Shipment) => s.status === 'in_transit' || s.status === 'overdue'

/** Mode, segment, carrier and lane filters (everything except time). */
export function slice(all: Shipment[], v: Pick<View, 'mode' | 'segment' | 'carrier' | 'lane'>) {
  return all.filter(
    (s) =>
      (v.mode === 'all' || s.mode === v.mode) &&
      (v.segment === 'all' || s.segment === v.segment) &&
      (!v.carrier || s.carrier === v.carrier) &&
      (!v.lane || s.lane === v.lane),
  )
}

/** Delivered shipments in the period and in the period before it. */
export function windows(sliced: Shipment[], period: View['period']) {
  const days = periodDays(period)
  const from = NOW - days * DAY
  const prevFrom = from - days * DAY
  const current: Shipment[] = []
  const previous: Shipment[] = []
  for (const s of sliced) {
    if (!isDone(s)) continue
    const t = s.delivered!
    if (t > from) current.push(s)
    else if (t > prevFrom) previous.push(s)
  }
  return { current, previous, from }
}

export interface Stats {
  n: number
  onTime: number
  otd: number
  breaches: number
  avgDelay: number
  cost: number
  costPerShipment: number
  costPerKg: number
  weight: number
  value: number
}

export function stats(list: Shipment[]): Stats {
  let n = 0
  let late = 0
  let delay = 0
  let cost = 0
  let weight = 0
  let value = 0
  for (const s of list) {
    if (!isDone(s)) continue
    n++
    if (s.status === 'late') {
      late++
      delay += s.delayHours
    }
    cost += totalCost(s)
    weight += s.weightKg
    value += s.cargoValueBdt
  }
  return {
    n,
    onTime: n - late,
    otd: n ? (100 * (n - late)) / n : 0,
    breaches: late,
    avgDelay: late ? delay / late : 0,
    cost,
    costPerShipment: n ? cost / n : 0,
    costPerKg: weight ? cost / weight : 0,
    weight,
    value,
  }
}

export function groupBy<K extends string>(list: Shipment[], key: (s: Shipment) => K) {
  const m = new Map<K, Shipment[]>()
  for (const s of list) {
    const k = key(s)
    const arr = m.get(k)
    if (arr) arr.push(s)
    else m.set(k, [s])
  }
  return m
}

export function groupStats<K extends string>(list: Shipment[], key: (s: Shipment) => K) {
  return [...groupBy(list, key).entries()].map(([k, ss]) => ({ key: k, ...stats(ss) }))
}

const localDate = (ms: number) => new Date(ms + 6 * 3_600_000)
export const monthKey = (ms: number) => {
  const d = localDate(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
/** Monday-based week start, as a yyyy-mm-dd key. */
export const weekKey = (ms: number) => {
  const d = localDate(ms)
  const dow = (d.getUTCDay() + 6) % 7
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow))
  return m.toISOString().slice(0, 10)
}

export interface SeriesPoint {
  key: string
  otd: number
  n: number
  breaches: number
  costPerShipment: number
  avgDelay: number
}

export function series(sliced: Shipment[], grain: 'month' | 'week'): SeriesPoint[] {
  const k = grain === 'month' ? monthKey : weekKey
  return groupStats(
    sliced.filter(isDone),
    (s) => k(s.delivered!),
  )
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({ key: g.key, otd: g.otd, n: g.n, breaches: g.breaches, costPerShipment: g.costPerShipment, avgDelay: g.avgDelay }))
}

/** Last 12 complete-ish weeks, for the sparklines on the KPI tiles. */
export function lastWeeks(sliced: Shipment[], count = 12) {
  const pts = series(sliced, 'week')
  return pts.slice(-count)
}

export function reasons(list: Shipment[]) {
  const late = list.filter((s) => s.status === 'late' && s.reason)
  const g = groupBy(late, (s) => s.reason as string)
  return [...g.entries()]
    .map(([reason, ss]) => ({ reason, n: ss.length, hours: ss.reduce((a, s) => a + s.delayHours, 0), share: ss.length / Math.max(1, late.length) }))
    .sort((a, b) => b.n - a.n)
}

export function openShipments(sliced: Shipment[]) {
  return sliced.filter(isOpen)
}

export const hourBand = (ms: number) => {
  const h = localDate(ms).getUTCHours()
  return h < 6 ? 'Night (0–6)' : h < 12 ? 'Morning (6–12)' : h < 16 ? 'Afternoon (12–4 pm)' : h < 22 ? 'Evening peak (4–10 pm)' : 'Late night (10 pm+)'
}
export const isPeakDispatch = (s: Shipment) => {
  const h = localDate(s.dispatch).getUTCHours()
  return s.mode === 'road' && h >= 16 && h <= 21
}
export const isMonsoon = (ms: number) => {
  const m = localDate(ms).getUTCMonth() + 1
  return m >= 6 && m <= 9
}
