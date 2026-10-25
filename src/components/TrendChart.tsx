import { useState } from 'react'
import { OTD_TARGET, type MonthPoint } from '../data/metrics'
import { EIDS } from '../data/network'
import { int, monthLabel, pct } from '../lib/format'

const W = 760
const H = 260
const PAD = { l: 44, r: 16, t: 34, b: 30 }

/** Monthly on-time delivery with the monsoon and Eid marked, because they explain most dips. */
export function TrendChart({ points }: { points: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="empty">Not enough months in this selection to draw a trend.</p>
  const lo = Math.max(0, Math.floor(Math.min(...points.map((p) => p.otd), OTD_TARGET) / 5) * 5 - 5)
  const hi = 100
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1)
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo)
  const step = (W - PAD.l - PAD.r) / (points.length - 1)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.otd)}`).join(' ')
  const ticks = []
  for (let v = lo; v <= hi; v += 5) ticks.push(v)

  // monsoon: June to September
  const bands: [number, number][] = []
  let start = -1
  points.forEach((p, i) => {
    const m = +p.key.slice(5)
    const wet = m >= 6 && m <= 9
    if (wet && start < 0) start = i
    if ((!wet || i === points.length - 1) && start >= 0) {
      bands.push([start, wet ? i : i - 1])
      start = -1
    }
  })
  const eids = EIDS.map((e) => ({ ...e, i: points.findIndex((p) => p.key === e.date.slice(0, 7)) })).filter((e) => e.i >= 0)
  const h = hover === null ? null : points[hover]

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly on-time delivery percentage">
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
            <circle cx={x(i)} cy={y(p.otd)} r={hover === i ? 5 : 3} className={`trend-dot${p.otd < OTD_TARGET ? ' below' : ''}`} />
            <rect
              x={x(i) - step / 2}
              y={PAD.t}
              width={step}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {i % 2 === (points.length - 1) % 2 ? (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="trend-axis">
                {monthLabel(p.key)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="trend-readout" aria-live="polite">
        {h ? (
          <>
            <b>{monthLabel(h.key)}</b>: {pct(h.otd)} on time across {int(h.shipments)} deliveries, {int(h.breaches)} breaches
          </>
        ) : (
          'Point at a month to see its numbers.'
        )}
      </p>
    </div>
  )
}
