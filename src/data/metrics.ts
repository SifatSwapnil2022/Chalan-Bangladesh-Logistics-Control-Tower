import { DAY, NOW, type Shipment } from './generate'
import type { Mode, Segment } from './network'

export type Period = '30d' | '90d' | '12m' | '18m'
export const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '12m', label: '12 months', days: 365 },
  { id: '18m', label: '18 months', days: 543 },
]

export interface Filters {
  period: Period
  mode: Mode | 'all'
  segment: Segment | 'all'
}

/** On-time delivery target used across the dashboard. */
export const OTD_TARGET = 90

const totalCost = (s: Shipment) => s.freightBdt + s.surchargeBdt + s.handlingBdt
const isDone = (s: Shipment) => s.status === 'on_time' || s.status === 'late'

export function bySlice(all: Shipment[], f: Omit<Filters, 'period'>) {
  return all.filter((s) => (f.mode === 'all' || s.mode === f.mode) && (f.segment === 'all' || s.segment === f.segment))
}

/** Shipments delivered (or due) inside the window, plus the window before it for comparison. */
export function windows(sliced: Shipment[], period: Period) {
  const days = PERIODS.find((p) => p.id === period)!.days
  const from = NOW - days * DAY
  const prevFrom = from - days * DAY
  const ref = (s: Shipment) => s.delivered ?? s.promised
  return {
    current: sliced.filter((s) => ref(s) > from && ref(s) <= NOW),
    previous: sliced.filter((s) => ref(s) > prevFrom && ref(s) <= from),
    days,
  }
}

export interface Kpis {
  delivered: number
  otd: number
  breaches: number
  avgDelay: number
  costPerShipment: number
  costPerKg: number
  totalCost: number
}

export function kpis(list: Shipment[]): Kpis {
  const done = list.filter(isDone)
  const late = done.filter((s) => s.status === 'late')
  const cost = done.reduce((a, s) => a + totalCost(s), 0)
  const kg = done.reduce((a, s) => a + s.weightKg, 0)
  return {
    delivered: done.length,
    otd: done.length ? (100 * (done.length - late.length)) / done.length : 0,
    breaches: late.length,
    avgDelay: late.length ? late.reduce((a, s) => a + s.delayHours, 0) / late.length : 0,
    costPerShipment: done.length ? cost / done.length : 0,
    costPerKg: kg ? cost / kg : 0,
    totalCost: cost,
  }
}

/** Shipments on the road right now (ignores the period filter). */
export function openShipments(sliced: Shipment[]) {
  const open = sliced.filter((s) => s.status === 'in_transit' || s.status === 'overdue')
  return { open, overdue: open.filter((s) => s.status === 'overdue') }
}

export interface LaneStat {
  lane: string
  from: string
  to: string
  mode: Mode
  shipments: number
  otd: number
  breaches: number
  avgDelay: number
  costPerShipment: number
}

export function laneStats(list: Shipment[]): LaneStat[] {
  const groups = new Map<string, Shipment[]>()
  for (const s of list) if (isDone(s)) (groups.get(s.lane) ?? groups.set(s.lane, []).get(s.lane)!).push(s)
  return [...groups.entries()].map(([lane, ss]) => {
    const k = kpis(ss)
    return { lane, from: ss[0].from, to: ss[0].to, mode: ss[0].mode, shipments: ss.length, otd: k.otd, breaches: k.breaches, avgDelay: k.avgDelay, costPerShipment: k.costPerShipment }
  })
}

export interface MonthPoint {
  key: string // 2025-06
  start: number
  otd: number
  shipments: number
  breaches: number
}

/** Monthly on-time trend across the whole history (respects mode and segment filters). */
export function monthly(sliced: Shipment[]): MonthPoint[] {
  const groups = new Map<string, Shipment[]>()
  for (const s of sliced) {
    if (!isDone(s)) continue
    const d = new Date(s.delivered! + 6 * 3_600_000)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(s)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ss]) => {
      const k = kpis(ss)
      return { key, start: Date.UTC(+key.slice(0, 4), +key.slice(5) - 1, 1), otd: k.otd, shipments: ss.length, breaches: k.breaches }
    })
}

export function reasons(list: Shipment[]) {
  const counts = new Map<string, { n: number; hours: number }>()
  for (const s of list) {
    if (s.status !== 'late' || !s.reason) continue
    const c = counts.get(s.reason) ?? { n: 0, hours: 0 }
    c.n++
    c.hours += s.delayHours
    counts.set(s.reason, c)
  }
  const total = [...counts.values()].reduce((a, c) => a + c.n, 0)
  return [...counts.entries()].map(([reason, c]) => ({ reason, n: c.n, share: total ? c.n / total : 0, hours: c.hours })).sort((a, b) => b.n - a.n)
}

export function hubVolumes(list: Shipment[]) {
  const v = new Map<string, number>()
  for (const s of list) {
    v.set(s.from, (v.get(s.from) ?? 0) + 1)
    v.set(s.to, (v.get(s.to) ?? 0) + 1)
  }
  return v
}
