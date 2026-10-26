import { useState } from 'react'
import { OTD_TARGET, type SeriesPoint } from '../data/metrics'
import { EIDS } from '../data/network'
import { int, pct } from '../lib/format'

const W = 760
const H = 250
const PAD = { l: 42, r: 14, t: 30, b: 28 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const label = (key: string, grain: 'month' | 'week') =>
  grain === 'month' ? `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}` : `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`
const monthOf = (key: string) => +key.slice(5, 7)

/** On-time trend with the monsoon shaded and Eid marked: the two things that explain most dips. */
export function TrendChart({ points, grain }: { points: SeriesPoint[]; grain: 'month' | 'week' }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="empty">Not enough data in this selection to draw a trend.</p>
  const lo = Math.max(0, Math.floor(Math.min(...points.map((p) => p.otd), OTD_TARGET) / 5) * 5 - 5)
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1)
  const y = (v: number) => PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / (100 - lo)
  const step = (W - PAD.l - PAD.r) / (points.length - 1)
  const ticks: number[] = []
  for (let v = lo; v <= 100; v += lo < 50 ? 10 : 5) ticks.push(v)

  const bands: [number, number][] = []
  let start = -1
  points.forEach((p, i) => {
    const wet = monthOf(p.key) >= 6 && monthOf(p.key) <= 9
    if (wet && start < 0) start = i
    if ((!wet || i === points.length - 1) && start >= 0) {
      bands.push([start, wet ? i : i - 1])
      start = -1
    }
  })
  const eids = EIDS.map((e) => {
    const t = Date.parse(e.date)
    let best = -1
    points.forEach((p, i) => {
      const pt = Date.parse(grain === 'month' ? `${p.key}-01` : p.key)
      if (pt <= t) best = i
    })
    return { ...e, i: best }
  }).filter((e) => e.i >= 0 && e.i < points.length - (grain === 'week' ? 0 : 0))
  const every = Math.ceil(points.length / 9)
  const h = hover === null ? null : points[hover]
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.otd).toFixed(1)}`).join(' ')

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`On-time delivery by ${grain}`}>
        {bands.map(([a, b]) => (
          <g key={a}>
            <rect x={x(a) - step / 2} y={PAD.t} width={(b - a + 1) * step} height={H - PAD.t - PAD.b} className="trend-monsoon" />
            <text x={x(a) - step / 2 + 6} y={PAD.t + 14} className="trend-note">
              Monsoon
            </text>
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="trend-axis">
              {v}%
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(OTD_TARGET)} y2={y(OTD_TARGET)} className="trend-target" />
        <text x={W - PAD.r} y={y(OTD_TARGET) - 6} textAnchor="end" className="trend-note target">
          Target {OTD_TARGET}%
        </text>
        {eids.map((e) => (
          <g key={e.date}>
            <line x1={x(e.i)} x2={x(e.i)} y1={PAD.t - 8} y2={H - PAD.b} className="trend-eid" />
            <text x={x(e.i)} y={PAD.t - 12} textAnchor="middle" className="trend-note">
              {e.name}
            </text>
          </g>
        ))}
        <path d={line} className="trend-line" />
        {points.map((p, i) => (
          <g key={p.key}>
            {grain === 'month' || hover === i ? <circle cx={x(i)} cy={y(p.otd)} r={hover === i ? 5 : 3} className={`trend-dot${p.otd < OTD_TARGET ? ' below' : ''}`} /> : null}
            <rect x={x(i) - step / 2} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {(points.length - 1 - i) % every === 0 ? (
              <text x={x(i)} y={H - 8} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="trend-axis">
                {label(p.key, grain)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="trend-readout" aria-live="polite">
        {h ? (
          <>
            {grain === 'week' ? 'Week of ' : ''}
            <b>{label(h.key, grain)}</b>: {pct(h.otd)} on time, {int(h.n)} delivered, {int(h.breaches)} breaches
          </>
        ) : (
          'Point at the chart to read a value.'
        )}
      </p>
    </div>
  )
}
