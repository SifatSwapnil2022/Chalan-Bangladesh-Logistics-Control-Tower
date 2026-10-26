// Exports the shipment history the way it would arrive from a TMS or carrier spreadsheets:
// local timestamps, carrier and hub names instead of codes, and the usual data entry problems.
// The analytics pipeline (analytics/pipeline) has to clean this before anything is measured.
//
//   npx tsx scripts/export-raw.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { DAY, HOUR, NOW, PORT_BY_MONTH, START, generate } from '../src/data/generate'
import { CARRIERS, HUBS, LANES, carrierById, hubById } from '../src/data/network'

const out = new URL('../analytics/data/', import.meta.url)
mkdirSync(new URL('raw/', out), { recursive: true })
mkdirSync(new URL('reference/', out), { recursive: true })

// separate seed so the mess never changes the clean data
let seed = 7341
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const pad = (n: number) => String(n).padStart(2, '0')
function local(ms: number, style: 'iso' | 'dmy' = 'iso') {
  const d = new Date(ms + 6 * HOUR)
  const [y, m, day, h, mi] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]
  return style === 'dmy' ? `${pad(day)}/${pad(m)}/${y} ${pad(h)}:${pad(mi)}` : `${y}-${pad(m)}-${pad(day)}T${pad(h)}:${pad(mi)}:00+06:00`
}
const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n') + '\n'

const VARIANTS: Record<string, string[]> = {
  CGP: ['Chittagong Port', 'CTG Port', 'chattogram port ', 'Chattogram'],
  DHK: ['Dhaka(Tejgaon)', 'DHAKA', 'Tejgaon'],
  GZP: ['Gazipur ', 'GAZIPUR'],
  NGJ: ['Narayangonj', 'N.Ganj'],
}

const issues = { duplicates: 0, hubNames: 0, missingDelivered: 0, negativeFreight: 0, dmyDates: 0, weightInTonnes: 0 }
const header = [
  'shipment_id', 'origin', 'destination', 'mode', 'carrier_name', 'customer', 'segment', 'vehicle', 'weight_kg', 'distance_km',
  'cargo_value_bdt', 'dispatched_at', 'promised_at', 'delivered_at', 'status', 'delay_reason', 'freight_bdt', 'fuel_surcharge_bdt', 'handling_bdt',
]
const rows: (string | number | null)[][] = [header]
const all = generate()
for (const s of all) {
  let origin = hubById[s.from].name
  let destination = hubById[s.to].name
  if (VARIANTS[s.from] && rnd() < 0.04) (origin = VARIANTS[s.from][Math.floor(rnd() * VARIANTS[s.from].length)]), issues.hubNames++
  if (VARIANTS[s.to] && rnd() < 0.04) (destination = VARIANTS[s.to][Math.floor(rnd() * VARIANTS[s.to].length)]), issues.hubNames++
  const style = rnd() < 0.02 ? 'dmy' : 'iso'
  if (style === 'dmy') issues.dmyDates++
  let delivered = s.delivered === null ? null : local(s.delivered, style)
  if (delivered && rnd() < 0.004) (delivered = null), issues.missingDelivered++
  let freight = s.freightBdt
  if (rnd() < 0.0015) (freight = -freight), issues.negativeFreight++
  let weight: number = s.weightKg
  if (s.mode === 'road' && rnd() < 0.003) (weight = +(s.weightKg / 1000).toFixed(2)), issues.weightInTonnes++
  const row = [
    s.id, origin, destination, s.mode.toUpperCase(), carrierById[s.carrier].name, s.customer, s.segment, s.vehicle, weight, s.distanceKm,
    s.cargoValueBdt, local(s.dispatch, style), local(s.promised, style), delivered, s.delivered === null ? 'In transit' : 'Delivered', s.reason,
    freight, s.surchargeBdt, s.handlingBdt,
  ]
  rows.push(row)
  if (rnd() < 0.008) rows.push([...row]), issues.duplicates++
}
writeFileSync(new URL('raw/shipments_raw.csv', out), csv(rows))

// reference tables
writeFileSync(
  new URL('reference/hubs.csv', out),
  csv([['hub_id', 'hub_name', 'short_name', 'latitude', 'longitude', 'is_international'], ...HUBS.map((h) => [h.id, h.name, h.short, h.lat, h.lon, h.international ? 1 : 0])]),
)
writeFileSync(
  new URL('reference/carriers.csv', out),
  csv([['carrier_id', 'carrier_name', 'mode'], ...CARRIERS.map((c) => [c.id, c.name, c.mode])]),
)
writeFileSync(new URL('reference/lanes.csv', out), csv([['lane_id', 'origin_id', 'destination_id', 'mode'], ...LANES.map((l) => [`${l.from}-${l.to}`, l.from, l.to, l.mode])]))

// daily Chattogram port congestion index, as a port authority feed would publish it (0 = clear, 1 = jammed)
const port: (string | number)[][] = [['date', 'port_congestion_index']]
let drift = 0
for (let t = START; t <= NOW; t += DAY) {
  const d = new Date(t + 6 * HOUR)
  drift = 0.85 * drift + (rnd() - 0.5) * 0.06
  port.push([`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, Math.min(1, Math.max(0, PORT_BY_MONTH[d.getUTCMonth()] + drift)).toFixed(3)])
}
writeFileSync(new URL('reference/port_congestion_daily.csv', out), csv(port))

console.log(`raw rows: ${rows.length - 1} (from ${all.length} shipments)`, issues)
