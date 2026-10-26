// What-if planner. Each lever is estimated from what the network already does, not from guesses:
// if the best carrier on a lane is on time 83% of the time and the worst 67%, moving a load from
// one to the other is worth 0.16 of a breach on average. The same logic is in
// analytics/pipeline/findings.py and the "Breaches Avoided" DAX measure.
import type { Shipment } from './generate'
import { CARRIERS, carrierById } from './network'
import { groupBy, isDone, stats, windows, type Stats } from './metrics'

export interface Levers {
  carrierShift: number // 0..1 share of the least reliable carrier's volume moved, per road lane
  offPeak: number // 0..1 share of 4–9 pm road dispatches moved to earlier slots
  eidCapacity: number // 0..1 share of the Eid slowdown closed by booking trucks in advance
  eidPremium: number // extra cost on Eid-window loads when capacity is booked early (e.g. 0.08)
}

export const DEFAULT_LEVERS: Levers = { carrierShift: 0.3, offPeak: 0.4, eidCapacity: 0.5, eidPremium: 0.08 }
const MIN_N = 20

export interface LaneMove {
  lane: string
  from: string
  to: string
  moved: number
  avoided: number
  costDelta: number
  fromOtd: number
  toOtd: number
}

export interface ScenarioResult {
  base: Stats
  months: number
  carrier: { avoided: number; costDelta: number; moves: LaneMove[] }
  offPeak: { avoided: number; moved: number; peakOtd: number; offOtd: number }
  eid: { avoided: number; costDelta: number; eidOtd: number; normalOtd: number; eidLoads: number }
  projected: { onTime: number; otd: number; breaches: number; cost: number; costPerShipment: number }
}

export function runScenario(all: Shipment[], l: Levers): ScenarioResult {
  const { current } = windows(all, '90d')
  const base = stats(current)
  const months = 3
  const road = current.filter((s) => s.mode === 'road')

  // lever 1: carrier reallocation within each road lane
  const moves: LaneMove[] = []
  for (const [lane, ss] of groupBy(road, (s) => s.lane)) {
    const byCarrier = [...groupBy(ss, (s) => s.carrier).entries()]
      .map(([c, cs]) => ({ c, ...stats(cs) }))
      .filter((x) => x.n >= MIN_N)
    if (byCarrier.length < 2) continue
    byCarrier.sort((a, b) => b.otd - a.otd)
    const best = byCarrier[0]
    const worst = byCarrier[byCarrier.length - 1]
    const moved = l.carrierShift * worst.n
    moves.push({
      lane,
      from: worst.c,
      to: best.c,
      moved,
      avoided: (moved * (best.otd - worst.otd)) / 100,
      costDelta: moved * (best.costPerShipment - worst.costPerShipment),
      fromOtd: worst.otd,
      toOtd: best.otd,
    })
  }
  moves.sort((a, b) => b.avoided - a.avoided)
  const carrier = { avoided: moves.reduce((a, m) => a + m.avoided, 0), costDelta: moves.reduce((a, m) => a + m.costDelta, 0), moves }

  // lever 2: move evening-peak road dispatches earlier, lane by lane
  let opAvoided = 0
  let opMoved = 0
  for (const [, ss] of groupBy(road, (s) => s.lane)) {
    const peak = stats(ss.filter((s) => s.f.peakHour))
    const off = stats(ss.filter((s) => !s.f.peakHour))
    if (peak.n < MIN_N || off.n < MIN_N) continue
    const moved = l.offPeak * peak.n
    opMoved += moved
    opAvoided += (moved * Math.max(0, off.otd - peak.otd)) / 100
  }
  const roadPeak = stats(road.filter((s) => s.f.peakHour))
  const roadOff = stats(road.filter((s) => !s.f.peakHour))

  // lever 3: Eid capacity. Eid falls outside most 90-day windows, so use the last 12 months and
  // spread the effect evenly (a quarter of the yearly effect per 90 days).
  const year = windows(all, '12m').current.filter((s) => s.mode === 'road' && isDone(s))
  const eidLoads = year.filter((s) => s.f.eid)
  const eidStats = stats(eidLoads)
  const normal = stats(year.filter((s) => !s.f.eid))
  const gap = Math.max(0, normal.otd - eidStats.otd)
  const eidAvoided = (l.eidCapacity * eidStats.n * gap) / 100 / 4
  const eidCost = (l.eidCapacity * eidStats.n * l.eidPremium * eidStats.costPerShipment) / 4

  const avoided = Math.min(base.breaches, carrier.avoided + opAvoided + eidAvoided)
  const cost = base.cost + carrier.costDelta + eidCost
  return {
    base,
    months,
    carrier,
    offPeak: { avoided: opAvoided, moved: opMoved, peakOtd: roadPeak.otd, offOtd: roadOff.otd },
    eid: { avoided: eidAvoided, costDelta: eidCost, eidOtd: eidStats.otd, normalOtd: normal.otd, eidLoads: eidStats.n / 4 },
    projected: {
      onTime: base.onTime + avoided,
      otd: (100 * (base.onTime + avoided)) / base.n,
      breaches: base.breaches - avoided,
      cost,
      costPerShipment: cost / base.n,
    },
  }
}

export const carrierName = (id: string) => carrierById[id]?.name ?? id
export const ROAD_CARRIERS = CARRIERS.filter((c) => c.mode === 'road')
