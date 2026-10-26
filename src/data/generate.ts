// Synthetic shipment history for the Chalan demo.
// Seeded, so every visitor sees the same 18 months of data. The patterns are modelled on how
// freight actually moves in Bangladesh: monsoon delays, Eid surges and shutdowns, Chattogram
// port congestion and the Dhaka–Chattogram highway.

import { CARRIERS, EIDS, LANES, SEGMENTS, carrierById, hubById, type Lane, type Mode, type Segment } from './network'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
/** "Now" for the demo. Fixed so the numbers on the page never drift. */
export const NOW = Date.UTC(2026, 9, 25, 4) // 25 Oct 2026, 10:00 in Dhaka
export const START = Date.UTC(2025, 4, 1) - 6 * HOUR // 1 May 2025, 00:00 in Dhaka

export type Status = 'on_time' | 'late' | 'in_transit' | 'overdue'

export interface Shipment {
  id: string
  lane: string // "GZP-CGP"
  from: string
  to: string
  mode: Mode
  carrier: string
  segment: Segment
  weightKg: number
  distanceKm: number
  dispatch: number // ms
  promised: number // ms
  delivered: number | null // ms; null while in transit
  status: Status
  delayHours: number // 0 when on time or still in transit
  reason: string | null
  freightBdt: number
  surchargeBdt: number
  handlingBdt: number
  customer: string // e.g. "RMG-07"
  vehicle: string
  cargoValueBdt: number
  // what was known at dispatch (used later by the delay-risk model)
  f: { monsoon: number; eid: number; port: number; load: number; peakHour: number; friday: number }
}

// ---------------------------------------------------------------- random numbers
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261025)
const uniform = (a: number, b: number) => a + (b - a) * rand()
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
const expo = () => -Math.log(1 - rand())
function pick<T>(items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0)
  let r = rand() * total
  for (const t of items) if ((r -= weight(t)) <= 0) return t
  return items[items.length - 1]
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

// ---------------------------------------------------------------- calendar effects
const dhakaDate = (ms: number) => new Date(ms + 6 * HOUR) // shift to Bangladesh time (UTC+6)
const EID_MS = EIDS.map((e) => Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10)) - 6 * HOUR)

/** Days to the nearest Eid (negative = before). */
function daysToEid(ms: number) {
  let best = Infinity
  for (const e of EID_MS) {
    const d = (ms - e) / DAY
    if (Math.abs(d) < Math.abs(best)) best = d
  }
  return best
}

/** Chattogram port congestion, 0–1, by month: worse before the RMG peak and in the monsoon. */
export const PORT_BY_MONTH = [0.5, 0.42, 0.65, 0.6, 0.55, 0.62, 0.72, 0.8, 0.66, 0.88, 0.95, 0.85]

function haversineKm(a: string, b: string) {
  const A = hubById[a]
  const B = hubById[b]
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(B.lat - A.lat)
  const dLon = toRad(B.lon - A.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(A.lat)) * Math.cos(toRad(B.lat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

const SEA_KM: Record<string, number> = { SIN: 2900, CMB: 2300, SHA: 5600 }
const SEA_DAYS: Record<string, number> = { SIN: 7, CMB: 6, SHA: 16 }

function laneDistance(l: Lane) {
  if (l.mode === 'sea') return SEA_KM[l.from === 'CGP' ? l.to : l.from]
  if (l.mode === 'air') return Math.round(haversineKm(l.from, l.to))
  return Math.max(18, Math.round(haversineKm(l.from, l.to) * 1.38))
}

function promisedHours(l: Lane, km: number) {
  if (l.mode === 'sea') return SEA_DAYS[l.from === 'CGP' ? l.to : l.from] * 24
  if (l.mode === 'air') return 30
  return Math.round(km / 30 + 8)
}

const HIGHWAY = new Set(['GZP-CGP', 'SVR-CGP', 'NGJ-CGP', 'DHK-CGP', 'CGP-DHK', 'CGP-GZP'])

const REASONS: Record<Mode, string[]> = {
  road: ['Traffic congestion', 'Monsoon weather', 'Port gate queue', 'Vehicle breakdown', 'Late loading at factory', 'Eid holiday backlog'],
  sea: ['Port congestion', 'Vessel delay', 'Customs hold', 'Monsoon weather'],
  air: ['Flight offload', 'Customs hold', 'Missing documents'],
}

// ---------------------------------------------------------------- generation
export function generate(): Shipment[] {
  const out: Shipment[] = []
  const carriersByMode = (m: Mode) => CARRIERS.filter((c) => c.mode === m)
  const daily: Record<string, number[]> = {} // shipments per origin per day, for congestion
  const days = Math.floor((NOW - START) / DAY)
  let seq = 0

  type Draft = Omit<Shipment, 'delivered' | 'status' | 'delayHours' | 'reason' | 'f'> & { day: number }
  const VALUE_PER_KG: Record<Segment, number> = { RMG: 1150, FMCG: 260, Pharma: 3800, 'E-commerce': 1400, Electronics: 3300 }
  const CUSTOMERS_PER_SEGMENT: Record<Segment, number> = { RMG: 14, FMCG: 9, Pharma: 5, 'E-commerce': 8, Electronics: 6 }
  const drafts: Draft[] = []

  for (let day = 0; day <= days; day++) {
    const t = START + day * DAY
    const date = dhakaDate(t)
    const month = date.getUTCMonth()
    const weekday = date.getUTCDay() // 5 = Friday
    const eid = daysToEid(t)
    let volume = 44
    volume *= weekday === 5 ? 0.42 : weekday === 6 ? 0.82 : 1
    if (eid >= -12 && eid < -1) volume *= 1.38 // pre-Eid rush
    if (eid >= -1 && eid <= 3) volume *= 0.28 // Eid holidays
    if (month >= 8 && month <= 10) volume *= 1.15 // RMG export peak
    volume *= 1 + 0.12 * (day / days) // the business grows
    const n = Math.max(0, Math.round(volume + normal() * Math.sqrt(volume)))

    for (let i = 0; i < n; i++) {
      const lane = pick(LANES, (l) => l.share)
      const carrier = pick(carriersByMode(lane.mode), (c) => (c.reliability < 0 ? 1.1 : 1))
      const segment = pick(
        SEGMENTS.filter((s) => lane.segments.includes(s.id)),
        (s) => s.share,
      )
      let weightKg =
        lane.mode === 'sea' ? uniform(8000, 22000) : lane.mode === 'air' ? uniform(60, 900) : uniform(segment.weight[0], segment.weight[1])
      weightKg = Math.round(weightKg / 10) * 10
      const km = laneDistance(lane)
      const hour = lane.mode === 'road' ? Math.floor(uniform(6, 23)) : Math.floor(uniform(2, 22))
      const dispatch = t + hour * HOUR + Math.floor(uniform(0, 60)) * 60_000
      const promised = dispatch + promisedHours(lane, km) * HOUR

      let freight: number
      if (lane.mode === 'road') freight = 3500 + km * (36 + (weightKg / 1000) * 11)
      else if (lane.mode === 'sea') freight = { SIN: 92000, CMB: 84000, SHA: 168000 }[lane.from === 'CGP' ? lane.to : lane.from]! * (0.75 + weightKg / 40000)
      else freight = weightKg * (lane.to === 'DXB' ? 520 : 610)
      freight *= carrier.costFactor * (0.94 + rand() * 0.12)
      const surcharge = freight * (lane.mode === 'air' ? 0.14 : lane.mode === 'sea' ? 0.06 : 0.09)
      const handling = lane.mode === 'road' ? 800 : lane.mode === 'sea' ? 6500 : 2400

      drafts.push({
        id: `CH-${date.getUTCFullYear() % 100}-${String(++seq).padStart(6, '0')}`,
        lane: `${lane.from}-${lane.to}`,
        from: lane.from,
        to: lane.to,
        mode: lane.mode,
        carrier: carrier.id,
        segment: segment.id,
        weightKg,
        distanceKm: km,
        dispatch,
        promised,
        freightBdt: Math.round(freight),
        customer: `${segment.id === 'E-commerce' ? 'ECM' : segment.id === 'Electronics' ? 'ELC' : segment.id === 'Pharma' ? 'PHA' : segment.id}-${String(1 + Math.floor(Math.pow(rand(), 1.6) * CUSTOMERS_PER_SEGMENT[segment.id])).padStart(2, '0')}`,
        vehicle:
          lane.mode === 'sea' ? '40 ft container' : lane.mode === 'air' ? 'Air cargo' : weightKg <= 3000 ? 'Covered van, 3 t' : weightKg <= 7500 ? 'Covered van, 7.5 t' : 'Truck, 15 t',
        cargoValueBdt: Math.round((weightKg * VALUE_PER_KG[segment.id] * (0.75 + rand() * 0.5)) / 100) * 100,
        surchargeBdt: Math.round(surcharge),
        handlingBdt: handling,
        day,
      })
      ;(daily[lane.from] ??= new Array(days + 1).fill(0))[day]++
    }
  }

  // average daily volume per origin, to judge how busy a hub is right now
  const avg: Record<string, number> = {}
  for (const [hub, counts] of Object.entries(daily)) avg[hub] = counts.reduce((a, b) => a + b, 0) / counts.length

  for (const d of drafts) {
    const date = dhakaDate(d.dispatch)
    const month = date.getUTCMonth()
    const counts = daily[d.from]
    let last7 = 0
    for (let k = Math.max(0, d.day - 7); k < d.day; k++) last7 += counts[k]
    const load = d.day >= 7 ? last7 / 7 / avg[d.from] : 1
    const monsoon = month >= 5 && month <= 8 ? 1 : 0
    const eidD = daysToEid(d.dispatch)
    const eid = eidD >= -10 && eidD <= 4 ? 1 : 0
    const touchesPort = d.from === 'CGP' || d.to === 'CGP'
    const port = touchesPort ? Math.min(1, Math.max(0, PORT_BY_MONTH[month] + normal() * 0.08)) : 0
    const hour = (date.getUTCHours() + 24) % 24
    const peakHour = d.mode === 'road' && hour >= 16 && hour <= 21 ? 1 : 0
    const friday = date.getUTCDay() === 5 ? 1 : 0
    const carrier = carrierById[d.carrier]

    const z =
      -2.45 +
      carrier.reliability +
      monsoon * (d.mode === 'road' ? 0.6 : d.mode === 'sea' ? 0.35 : 0.12) +
      eid * (d.mode === 'road' ? 0.95 : 0.3) +
      (touchesPort ? 1.25 * port - 0.45 : 0) +
      (HIGHWAY.has(d.lane) ? 0.3 : 0) +
      0.9 * (load - 1) +
      (d.mode === 'road' && d.weightKg > 7000 ? 0.2 : 0) +
      peakHour * 0.25 -
      friday * 0.2 +
      normal() * 0.35
    const late = rand() < sigmoid(z)

    let delayHours = 0
    let reason: string | null = null
    if (late) {
      delayHours = d.mode === 'road' ? 2 + expo() * 14 : d.mode === 'sea' ? 18 + expo() * 52 : 3 + expo() * 16
      delayHours = Math.round(Math.min(delayHours, d.mode === 'sea' ? 240 : 96) * 10) / 10
      const r = REASONS[d.mode]
      if (d.mode === 'road') {
        reason = pick(r, (x) =>
          x === 'Monsoon weather' ? 0.3 + monsoon * 2.2
          : x === 'Eid holiday backlog' ? eid * 3
          : x === 'Port gate queue' ? (touchesPort ? 0.4 + port * 2.2 : 0)
          : x === 'Traffic congestion' ? 1.6 + peakHour + (HIGHWAY.has(d.lane) ? 0.8 : 0)
          : x === 'Vehicle breakdown' ? 0.7 + Math.max(0, carrier.reliability) * 2
          : 0.8,
        )
      } else if (d.mode === 'sea') {
        reason = pick(r, (x) => (x === 'Port congestion' ? 0.5 + port * 3 : x === 'Monsoon weather' ? monsoon * 1.4 : x === 'Vessel delay' ? 1.1 : 0.7))
      } else {
        reason = pick(r, (x) => (x === 'Flight offload' ? 1.4 + eid : x === 'Customs hold' ? 0.9 : 0.6))
      }
    }

    const deliveredAt = late ? d.promised + delayHours * HOUR : d.promised - rand() * 0.22 * (d.promised - d.dispatch)
    const { day: _day, ...rest } = d
    void _day
    let status: Status
    let delivered: number | null = Math.round(deliveredAt)
    if (deliveredAt > NOW) {
      delivered = null
      status = d.promised < NOW ? 'overdue' : 'in_transit'
      delayHours = 0
      reason = null
    } else status = late ? 'late' : 'on_time'

    out.push({ ...rest, delivered, status, delayHours: status === 'late' ? delayHours : 0, reason, f: { monsoon, eid, port, load, peakHour, friday } })
  }
  return out
}
