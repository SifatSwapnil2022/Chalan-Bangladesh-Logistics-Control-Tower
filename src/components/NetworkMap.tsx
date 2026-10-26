import { geoMercator, geoPath } from 'd3-geo'
import type { Feature, Geometry } from 'geojson'
import { useState } from 'react'
import bangladesh from '../data/bangladesh.json'
import { OTD_TARGET, type Stats } from '../data/metrics'
import { HUBS, MODE_LABEL, hubById, type Mode } from '../data/network'
import { bdt, hours, int, pct } from '../lib/format'

const W = 560
const H = 600
const bd = bangladesh as unknown as Feature<Geometry>
const projection = geoMercator().fitExtent(
  [
    [40, 16],
    [W - 30, H - 16],
  ],
  bd,
)
const path = geoPath(projection)
const xy = (id: string) => projection([hubById[id].lon, hubById[id].lat])!

const LABEL: Record<string, { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }> = {
  DHK: { dx: -10, dy: 16, anchor: 'end' },
  GZP: { dx: 8, dy: -8, anchor: 'start' },
  SVR: { dx: -9, dy: 2, anchor: 'end' },
  NGJ: { dx: -6, dy: 18, anchor: 'end' },
  CGP: { dx: -10, dy: 4, anchor: 'end' },
  CML: { dx: 4, dy: -10, anchor: 'start' },
  SYL: { dx: 0, dy: -12, anchor: 'middle' },
  MGL: { dx: 0, dy: 18, anchor: 'middle' },
  BGR: { dx: 0, dy: -12, anchor: 'middle' },
}

export const statusColor = (otd: number) => (otd >= OTD_TARGET ? 'var(--ok)' : otd >= 80 ? 'var(--warn)' : 'var(--bad)')

export type LaneRow = Stats & { key: string; from: string; to: string; mode: Mode }

export function NetworkMap({
  lanes,
  selected,
  onSelect,
  onOpen,
}: {
  lanes: LaneRow[]
  selected: string | null
  onSelect: (lane: string | null) => void
  onOpen: (lane: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const domestic = lanes.filter((l) => !hubById[l.from].international && !hubById[l.to].international)
  const abroad = lanes.filter((l) => hubById[l.from].international || hubById[l.to].international).sort((a, b) => b.n - a.n)
  const maxN = Math.max(1, ...domestic.map((l) => l.n))
  const hubN = new Map<string, number>()
  for (const l of domestic) {
    hubN.set(l.from, (hubN.get(l.from) ?? 0) + l.n)
    hubN.set(l.to, (hubN.get(l.to) ?? 0) + l.n)
  }
  const maxHub = Math.max(1, ...hubN.values())
  const focus = hover ?? selected
  const card = lanes.find((l) => l.key === focus)

  const curve = (l: LaneRow) => {
    const [x1, y1] = xy(l.from)
    const [x2, y2] = xy(l.to)
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const bend = Math.min(36, len * 0.18)
    const mx = (x1 + x2) / 2 - ((y2 - y1) / len) * bend
    const my = (y1 + y2) / 2 + ((x2 - x1) / len) * bend
    return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
  }

  return (
    <div className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of Bangladesh: freight lanes coloured by on-time delivery">
        <path d={path(bd) ?? ''} className="map-land" onClick={() => onSelect(null)} />
        <text x={W - 40} y={H - 14} textAnchor="end" className="map-sea">
          Bay of Bengal
        </text>
        {[...domestic]
          .sort((a, b) => a.n - b.n)
          .map((l) => (
            <path
              key={l.key}
              d={curve(l)}
              className={`map-lane${focus && focus !== l.key ? ' dim' : ''}${selected === l.key ? ' on' : ''}`}
              stroke={statusColor(l.otd)}
              strokeWidth={1.5 + 7 * Math.sqrt(l.n / maxN)}
              tabIndex={0}
              role="button"
              aria-pressed={selected === l.key}
              aria-label={`${hubById[l.from].short} to ${hubById[l.to].short}, ${pct(l.otd)} on time`}
              onMouseEnter={() => setHover(l.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(l.key)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(selected === l.key ? null : l.key)}
              onKeyDown={(e) => (e.key === 'Enter' ? onSelect(selected === l.key ? null : l.key) : null)}
            />
          ))}
        {HUBS.filter((h) => !h.international && hubN.has(h.id)).map((h) => {
          const [x, y] = xy(h.id)
          const lab = LABEL[h.id]
          return (
            <g key={h.id} className="map-hub-g">
              <circle cx={x} cy={y} r={3 + 6 * Math.sqrt((hubN.get(h.id) ?? 0) / maxHub)} className="map-hub" />
              {lab ? (
                <text x={x + lab.dx} y={y + lab.dy} textAnchor={lab.anchor} className="map-label">
                  {h.short}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {card ? (
        <div className="map-card" aria-live="polite">
          <p className="map-card-title">
            {hubById[card.from].short} to {hubById[card.to].short}
            <span>{MODE_LABEL[card.mode]}</span>
          </p>
          <dl>
            <dt>On time</dt>
            <dd className="hi">{pct(card.otd)}</dd>
            <dt>Delivered</dt>
            <dd>{int(card.n)}</dd>
            <dt>SLA breaches</dt>
            <dd>{int(card.breaches)}</dd>
            <dt>Average delay when late</dt>
            <dd>{hours(card.avgDelay)}</dd>
            <dt>Cost per shipment</dt>
            <dd>{bdt(card.costPerShipment)}</dd>
          </dl>
          <button className="map-card-open" onClick={() => onOpen(card.key)}>
            Open lane details
          </button>
        </div>
      ) : (
        <p className="map-hint">Click a lane to filter every chart on this page. Click again to clear.</p>
      )}

      <div className="map-abroad">
        <p className="map-abroad-title">Sea and air lanes</p>
        <table>
          <tbody>
            {abroad.map((l) => (
              <tr
                key={l.key}
                className={selected === l.key ? 'on' : ''}
                onClick={() => onSelect(selected === l.key ? null : l.key)}
                onMouseEnter={() => setHover(l.key)}
                onMouseLeave={() => setHover(null)}
              >
                <td>
                  {hubById[l.from].short} to {hubById[l.to].short}
                </td>
                <td className="muted">{MODE_LABEL[l.mode]}</td>
                <td className="num" style={{ color: statusColor(l.otd) }}>
                  {pct(l.otd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--ok)' }} />
          {OTD_TARGET}% or better
        </span>
        <span>
          <i style={{ background: 'var(--warn)' }} />
          80–{OTD_TARGET}%
        </span>
        <span>
          <i style={{ background: 'var(--bad)' }} />
          Below 80%
        </span>
        <span className="muted">Line width shows volume</span>
      </div>
    </div>
  )
}
