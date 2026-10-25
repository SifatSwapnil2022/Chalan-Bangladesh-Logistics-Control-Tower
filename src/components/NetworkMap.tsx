import { geoMercator, geoPath } from 'd3-geo'
import type { Feature, Geometry } from 'geojson'
import { useMemo, useState } from 'react'
import bangladesh from '../data/bangladesh.json'
import { OTD_TARGET, type LaneStat } from '../data/metrics'
import { HUBS, MODE_LABEL, hubById } from '../data/network'
import { bdt, hours, int, pct } from '../lib/format'

const W = 560
const H = 620
const bd = bangladesh as unknown as Feature<Geometry>
const projection = geoMercator().fitExtent(
  [
    [40, 20],
    [W - 30, H - 20],
  ],
  bd,
)
const path = geoPath(projection)
const xy = (id: string) => projection([hubById[id].lon, hubById[id].lat])!

/** Hand-placed labels: the Dhaka cluster is too tight for automatic placement. */
const LABEL: Record<string, { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }> = {
  DHK: { dx: -10, dy: 16, anchor: 'end' },
  HSIA: { dx: -8, dy: -6, anchor: 'end' },
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

export function NetworkMap({ lanes, volumes }: { lanes: LaneStat[]; volumes: Map<string, number> }) {
  const [hover, setHover] = useState<string | null>(null)
  const domestic = lanes.filter((l) => !hubById[l.from].international && !hubById[l.to].international)
  const abroad = lanes.filter((l) => hubById[l.from].international || hubById[l.to].international).sort((a, b) => b.shipments - a.shipments)
  const maxShip = Math.max(1, ...domestic.map((l) => l.shipments))
  const maxVol = Math.max(1, ...volumes.values())

  // Lanes in both directions (CGP->DHK and DHK->CGP) bend to opposite sides so both stay visible.
  const curves = useMemo(
    () =>
      domestic.map((l) => {
        const [x1, y1] = xy(l.from)
        const [x2, y2] = xy(l.to)
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        const len = Math.hypot(x2 - x1, y2 - y1) || 1
        const bend = Math.min(36, len * 0.18)
        const nx = -(y2 - y1) / len
        const ny = (x2 - x1) / len
        return { l, d: `M${x1},${y1} Q${mx + nx * bend},${my + ny * bend} ${x2},${y2}` }
      }),
    [domestic],
  )
  const active = lanes.find((l) => l.lane === hover)

  return (
    <div className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of Bangladesh with freight lanes coloured by on-time delivery">
        <path d={path(bd) ?? ''} className="map-land" />
        <text x={150} y={H - 50} className="map-sea">
          Bay of Bengal
        </text>
        {curves
          .sort((a, b) => a.l.shipments - b.l.shipments)
          .map(({ l, d }) => (
            <path
              key={l.lane}
              d={d}
              className={`map-lane${hover && hover !== l.lane ? ' dim' : ''}`}
              stroke={statusColor(l.otd)}
              strokeWidth={1.5 + 7 * Math.sqrt(l.shipments / maxShip)}
              tabIndex={0}
              onMouseEnter={() => setHover(l.lane)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(l.lane)}
              onBlur={() => setHover(null)}
            >
              <title>{`${hubById[l.from].short} to ${hubById[l.to].short}: ${pct(l.otd)} on time`}</title>
            </path>
          ))}
        {HUBS.filter((h) => !h.international && h.id !== 'HSIA' && volumes.has(h.id)).map((h) => {
          const [x, y] = xy(h.id)
          const lab = LABEL[h.id]
          const r = 3 + 6 * Math.sqrt((volumes.get(h.id) ?? 0) / maxVol)
          return (
            <g key={h.id}>
              <circle cx={x} cy={y} r={r} className="map-hub" />
              <text x={x + lab.dx} y={y + lab.dy} textAnchor={lab.anchor} className="map-label">
                {h.short}
              </text>
            </g>
          )
        })}
      </svg>

      {active ? (
        <div className="map-card" aria-live="polite">
          <p className="map-card-title">
            {hubById[active.from].short} to {hubById[active.to].short}
          </p>
          <dl>
            <dt>On time</dt>
            <dd style={{ color: statusColor(active.otd) }}>{pct(active.otd)}</dd>
            <dt>Shipments</dt>
            <dd>{int(active.shipments)}</dd>
            <dt>SLA breaches</dt>
            <dd>{int(active.breaches)}</dd>
            <dt>Average delay when late</dt>
            <dd>{hours(active.avgDelay)}</dd>
            <dt>Cost per shipment</dt>
            <dd>{bdt(active.costPerShipment)}</dd>
          </dl>
        </div>
      ) : null}

      <div className="map-abroad">
        <p className="map-abroad-title">Sea and air lanes</p>
        <table>
          <tbody>
            {abroad.map((l) => (
              <tr key={l.lane} onMouseEnter={() => setHover(l.lane)} onMouseLeave={() => setHover(null)}>
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

      <div className="map-legend" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--ok)' }} />
          On target ({OTD_TARGET}%+)
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
