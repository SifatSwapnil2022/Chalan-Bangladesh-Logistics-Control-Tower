// The logistics network: hubs, carriers, customer segments and the lanes between them.
// Hub coordinates are real; carriers are fictional.

export type Mode = 'road' | 'sea' | 'air'

export interface Hub {
  id: string
  name: string
  short: string
  lat: number
  lon: number
  international?: boolean
}

export const HUBS: Hub[] = [
  { id: 'DHK', name: 'Dhaka (Tejgaon)', short: 'Dhaka', lat: 23.763, lon: 90.393 },
  { id: 'HSIA', name: 'Dhaka Airport (HSIA)', short: 'HSIA', lat: 23.843, lon: 90.398 },
  { id: 'CGP', name: 'Chattogram Port', short: 'Chattogram', lat: 22.31, lon: 91.8 },
  { id: 'GZP', name: 'Gazipur', short: 'Gazipur', lat: 23.999, lon: 90.42 },
  { id: 'NGJ', name: 'Narayanganj', short: 'Narayanganj', lat: 23.62, lon: 90.5 },
  { id: 'SVR', name: 'Savar EPZ', short: 'Savar', lat: 23.858, lon: 90.266 },
  { id: 'CML', name: 'Cumilla', short: 'Cumilla', lat: 23.461, lon: 91.185 },
  { id: 'SYL', name: 'Sylhet', short: 'Sylhet', lat: 24.894, lon: 91.868 },
  { id: 'MGL', name: 'Khulna (Mongla)', short: 'Mongla', lat: 22.49, lon: 89.6 },
  { id: 'BGR', name: 'Bogura', short: 'Bogura', lat: 24.848, lon: 89.373 },
  { id: 'SIN', name: 'Singapore', short: 'Singapore', lat: 1.29, lon: 103.85, international: true },
  { id: 'CMB', name: 'Colombo', short: 'Colombo', lat: 6.93, lon: 79.85, international: true },
  { id: 'DXB', name: 'Dubai', short: 'Dubai', lat: 25.2, lon: 55.27, international: true },
  { id: 'SHA', name: 'Shanghai', short: 'Shanghai', lat: 31.23, lon: 121.47, international: true },
]

export const hubById = Object.fromEntries(HUBS.map((h) => [h.id, h])) as Record<string, Hub>

export interface Carrier {
  id: string
  name: string
  mode: Mode
  /** added to the log-odds of a delay; negative is more reliable */
  reliability: number
  /** multiplier on the base freight rate */
  costFactor: number
}

export const CARRIERS: Carrier[] = [
  { id: 'PFL', name: 'Padma Freight Lines', mode: 'road', reliability: -0.45, costFactor: 1.12 },
  { id: 'MGT', name: 'Meghna Transport', mode: 'road', reliability: 0.05, costFactor: 1.0 },
  { id: 'KFM', name: 'Karnaphuli Movers', mode: 'road', reliability: 0.55, costFactor: 0.88 },
  { id: 'JMH', name: 'Jamuna Haulage', mode: 'road', reliability: 0.25, costFactor: 0.94 },
  { id: 'BLS', name: 'Bay Link Shipping', mode: 'sea', reliability: -0.2, costFactor: 1.06 },
  { id: 'SSC', name: 'Sundarban Sea Cargo', mode: 'sea', reliability: 0.35, costFactor: 0.92 },
  { id: 'SKY', name: 'Skyway Cargo', mode: 'air', reliability: -0.35, costFactor: 1.08 },
  { id: 'DAF', name: 'Delta Air Freight', mode: 'air', reliability: 0.3, costFactor: 0.95 },
]

export const carrierById = Object.fromEntries(CARRIERS.map((c) => [c.id, c])) as Record<string, Carrier>

export type Segment = 'RMG' | 'FMCG' | 'Pharma' | 'E-commerce' | 'Electronics'

export const SEGMENTS: { id: Segment; label: string; share: number; weight: [number, number] }[] = [
  { id: 'RMG', label: 'Garments (RMG)', share: 0.38, weight: [2500, 9000] },
  { id: 'FMCG', label: 'FMCG', share: 0.24, weight: [1500, 7000] },
  { id: 'Pharma', label: 'Pharma', share: 0.1, weight: [300, 2500] },
  { id: 'E-commerce', label: 'E-commerce', share: 0.18, weight: [200, 2000] },
  { id: 'Electronics', label: 'Electronics', share: 0.1, weight: [400, 3500] },
]

export interface Lane {
  from: string
  to: string
  mode: Mode
  /** relative share of shipments */
  share: number
  /** segments that use this lane */
  segments: Segment[]
}

// Most RMG cargo moves from factory belts (Gazipur, Savar, Narayanganj) to Chattogram Port for export;
// imports come back through the port; FMCG and e-commerce flow out from Dhaka to the divisions.
export const LANES: Lane[] = [
  { from: 'GZP', to: 'CGP', mode: 'road', share: 11, segments: ['RMG'] },
  { from: 'SVR', to: 'CGP', mode: 'road', share: 8, segments: ['RMG'] },
  { from: 'NGJ', to: 'CGP', mode: 'road', share: 7, segments: ['RMG', 'FMCG'] },
  { from: 'DHK', to: 'CGP', mode: 'road', share: 6, segments: ['RMG', 'Electronics'] },
  { from: 'CGP', to: 'DHK', mode: 'road', share: 9, segments: ['FMCG', 'Electronics', 'Pharma'] },
  { from: 'CGP', to: 'GZP', mode: 'road', share: 4, segments: ['RMG', 'FMCG'] },
  { from: 'DHK', to: 'SYL', mode: 'road', share: 5, segments: ['FMCG', 'E-commerce', 'Pharma'] },
  { from: 'DHK', to: 'MGL', mode: 'road', share: 4, segments: ['FMCG', 'E-commerce'] },
  { from: 'MGL', to: 'DHK', mode: 'road', share: 3, segments: ['FMCG', 'Electronics'] },
  { from: 'DHK', to: 'BGR', mode: 'road', share: 5, segments: ['FMCG', 'E-commerce', 'Pharma'] },
  { from: 'DHK', to: 'CML', mode: 'road', share: 4, segments: ['FMCG', 'E-commerce'] },
  { from: 'DHK', to: 'GZP', mode: 'road', share: 3, segments: ['E-commerce', 'FMCG'] },
  { from: 'DHK', to: 'NGJ', mode: 'road', share: 3, segments: ['E-commerce', 'FMCG'] },
  { from: 'CGP', to: 'SIN', mode: 'sea', share: 5, segments: ['RMG'] },
  { from: 'CGP', to: 'CMB', mode: 'sea', share: 4, segments: ['RMG'] },
  { from: 'SHA', to: 'CGP', mode: 'sea', share: 4, segments: ['Electronics', 'RMG'] },
  { from: 'HSIA', to: 'DXB', mode: 'air', share: 3, segments: ['RMG', 'Pharma'] },
  { from: 'HSIA', to: 'SIN', mode: 'air', share: 2, segments: ['Pharma', 'Electronics', 'RMG'] },
]

/** Approximate Eid dates in the data window (day before the moon sighting can shift by a day). */
export const EIDS: { date: string; name: string }[] = [
  { date: '2025-06-07', name: 'Eid ul-Adha' },
  { date: '2026-03-20', name: 'Eid ul-Fitr' },
  { date: '2026-05-27', name: 'Eid ul-Adha' },
]

export const MODE_LABEL: Record<Mode, string> = { road: 'Road', sea: 'Sea', air: 'Air' }
