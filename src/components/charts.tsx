import { useMemo, useState, type ReactNode } from 'react'
import { OTD_TARGET } from '../data/metrics'
import { int, pct } from '../lib/format'
import { statusColor } from './NetworkMap'

/* ------------------------------------------------------------------ bar list */

export interface BarItem {
  key: string
  label: ReactNode
  value: number
  display: string
  sub?: string
  color?: string
}

/** Horizontal bars with the value at the end. Click to select (cross-filter). */
export function BarList({ items, selected, onSelect, max }: { items: BarItem[]; selected?: string | null; onSelect?: (k: string | null) => void; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="bars">
      {items.map((i) => {
        const on = selected === i.key
        const dim = selected && !on
        const body = (
          <>
            <span className="bars-label">
              {i.label}
              {i.sub ? <small>{i.sub}</small> : null}
            </span>
            <span className="bars-track">
              <span className="bars-fill" style={{ width: `${(100 * Math.max(0, i.value)) / top}%`, background: i.color ?? 'var(--brand)' }} />
            </span>
            <span className="bars-value">{i.display}</span>
          </>
        )
        return (
          <li key={i.key} className={`${on ? 'on' : ''}${dim ? ' dim' : ''}`}>
            {onSelect ? (
              <button onClick={() => onSelect(on ? null : i.key)} aria-pressed={on}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ table */

export interface Column<T> {
  key: string
  label: string
  value: (r: T) => number | string
  render?: (r: T) => ReactNode
  num?: boolean
  bar?: { max: number; color?: (r: T) => string }
  width?: string
  hideSm?: boolean
}

/** Sortable table. Numeric columns can carry an in-cell data bar, as in a BI matrix visual. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRow,
  rowClass,
  limit,
  empty = 'Nothing matches the current filters.',
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (r: T) => string
  initialSort?: { key: string; desc: boolean }
  onRow?: (r: T) => void
  rowClass?: (r: T) => string
  limit?: number
  empty?: string
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, desc: false })
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0]
    return [...rows].sort((a, b) => {
      const x = col.value(a)
      const y = col.value(b)
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.desc ? -d : d
    })
  }, [rows, columns, sort])
  if (!rows.length) return <p className="empty">{empty}</p>
  const shown = limit && !all ? sorted.slice(0, limit) : sorted
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort.key === c.key
              return (
                <th key={c.key} className={`${c.num ? 'num' : ''}${c.hideSm ? ' hide-sm' : ''}`} style={{ width: c.width }} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <button onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : !!c.num })}>
                    {c.label}
                    <span className="sort-mark">{active ? (sort.desc ? '↓' : '↑') : ''}</span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)} className={`${onRow ? 'clickable ' : ''}${rowClass?.(r) ?? ''}`} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? 'num' : ''}${c.hideSm ? ' hide-sm' : ''}`}>
                  {c.bar ? (
                    <span className="cell-bar">
                      <i style={{ width: `${Math.min(100, (100 * Math.max(0, Number(c.value(r)))) / c.bar.max)}%`, background: c.bar.color?.(r) ?? 'var(--bar)' }} />
                      <span>{c.render ? c.render(r) : c.value(r)}</span>
                    </span>
                  ) : c.render ? (
                    c.render(r)
                  ) : (
                    c.value(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit ? (
        <button className="link-btn table-more" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ OD matrix */

export interface MatrixCell {
  row: string
  col: string
  value: number
  display: string
  title: string
  color: string
  alpha: number
  key: string
}

/** Origin × destination matrix. Empty cells are lanes that do not exist. */
export function Matrix({ rows, cols, cells, rowLabel, colLabel, onCell, selected }: { rows: { id: string; label: string }[]; cols: { id: string; label: string }[]; cells: MatrixCell[]; rowLabel: string; colLabel: string; onCell: (c: MatrixCell) => void; selected?: string | null }) {
  const at = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]))
  return (
    <div className="table-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix-corner">
              <span>{rowLabel} ↓</span>
              <span>{colLabel} →</span>
            </th>
            {cols.map((c) => (
              <th key={c.id} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              {cols.map((c) => {
                const cell = at.get(`${r.id}|${c.id}`)
                if (!cell) return <td key={c.id} className="matrix-none" />
                return (
                  <td key={c.id}>
                    <button
                      className={`matrix-cell${selected === cell.key ? ' on' : ''}`}
                      style={{ ['--c' as string]: cell.color, ['--a' as string]: cell.alpha }}
                      title={cell.title}
                      onClick={() => onCell(cell)}
                    >
                      {cell.display}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ scatter */

export interface Point {
  key: string
  x: number
  y: number
  r: number
  label: string
  detail: string
}

/** Cost against reliability. The dashed lines split it into four quadrants. */
export function Scatter({ points, xLabel, yLabel, xFmt, xSplit, onPoint, selected }: { points: Point[]; xLabel: string; yLabel: string; xFmt: (n: number) => string; xSplit: number; onPoint?: (p: Point) => void; selected?: string | null }) {
  const [hover, setHover] = useState<string | null>(null)
  const W = 640
  const H = 360
  const P = { l: 48, r: 16, t: 16, b: 40 }
  if (!points.length) return <p className="empty">Nothing to plot for this selection.</p>
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x0 = Math.min(...xs) * 0.94
  const x1 = Math.max(...xs) * 1.04
  const y0 = Math.max(0, Math.floor(Math.min(...ys, OTD_TARGET - 10) / 5) * 5)
  const y1 = 100
  const X = (v: number) => P.l + ((v - x0) * (W - P.l - P.r)) / (x1 - x0 || 1)
  const Y = (v: number) => P.t + ((y1 - v) * (H - P.t - P.b)) / (y1 - y0 || 1)
  const maxR = Math.max(...points.map((p) => p.r))
  const R = (v: number) => 4 + 12 * Math.sqrt(v / maxR)
  const xt = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * (i + 0.5)) / 5)
  const yt: number[] = []
  for (let v = y0; v <= 100; v += 5) yt.push(v)
  const focus = points.find((p) => p.key === (hover ?? selected))
  return (
    <div className="scatter">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} className="trend-grid" />
            <text x={P.l - 8} y={Y(v) + 4} textAnchor="end" className="trend-axis">
              {v}%
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={v} x={X(v)} y={H - 20} textAnchor="middle" className="trend-axis">
            {xFmt(v)}
          </text>
        ))}
        <text x={(P.l + W - P.r) / 2} y={H - 4} textAnchor="middle" className="trend-axis strong">
          {xLabel}
        </text>
        <line x1={P.l} x2={W - P.r} y1={Y(OTD_TARGET)} y2={Y(OTD_TARGET)} className="trend-target" />
        <line x1={X(xSplit)} x2={X(xSplit)} y1={P.t} y2={H - P.b} className="quad" />
        <text x={P.l + 6} y={P.t + 12} className="quad-label">
          Cheaper and reliable
        </text>
        <text x={W - P.r - 6} y={P.t + 12} textAnchor="end" className="quad-label">
          Dearer and reliable
        </text>
        <text x={P.l + 6} y={H - P.b - 8} className="quad-label">
          Cheaper but late
        </text>
        <text x={W - P.r - 6} y={H - P.b - 8} textAnchor="end" className="quad-label">
          Dearer and late
        </text>
        {[...points]
          .sort((a, b) => b.r - a.r)
          .map((p) => (
            <circle
              key={p.key}
              cx={X(p.x)}
              cy={Y(p.y)}
              r={R(p.r)}
              className={`dot${focus && focus.key !== p.key ? ' dim' : ''}${selected === p.key ? ' on' : ''}`}
              fill={statusColor(p.y)}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPoint?.(p)}
            />
          ))}
        {focus ? (
          <text x={Math.min(X(focus.x) + R(focus.r) + 4, W - 120)} y={Y(focus.y) - R(focus.r) - 2} className="dot-label">
            {focus.label}
          </text>
        ) : null}
      </svg>
      <p className="trend-readout">{focus ? focus.detail : 'Bubble size is the number of deliveries. Point at a bubble for details.'}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ model charts */

const MW = 320
const MH = 280
const MP = { l: 40, r: 12, t: 12, b: 36 }
const mx = (v: number) => MP.l + v * (MW - MP.l - MP.r)
const my = (v: number) => MP.t + (1 - v) * (MH - MP.t - MP.b)
const axes = (xl: string, yl: string) => (
  <>
    {[0, 0.25, 0.5, 0.75, 1].map((v) => (
      <g key={v}>
        <line x1={mx(0)} x2={mx(1)} y1={my(v)} y2={my(v)} className="trend-grid" />
        <text x={mx(0) - 6} y={my(v) + 4} textAnchor="end" className="trend-axis">
          {Math.round(v * 100)}
        </text>
        <text x={mx(v)} y={MH - 20} textAnchor="middle" className="trend-axis">
          {Math.round(v * 100)}
        </text>
      </g>
    ))}
    <text x={(mx(0) + mx(1)) / 2} y={MH - 3} textAnchor="middle" className="trend-axis strong">
      {xl}
    </text>
    <text transform={`translate(11 ${(my(0) + my(1)) / 2}) rotate(-90)`} textAnchor="middle" className="trend-axis strong">
      {yl}
    </text>
  </>
)

export function RocChart({ roc, point, auc }: { roc: number[][]; point: { fpr: number; tpr: number }; auc: number }) {
  const d = roc.map(([f, t], i) => `${i ? 'L' : 'M'}${mx(f).toFixed(1)},${my(t).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${MW} ${MH}`} className="model-chart" role="img" aria-label={`ROC curve, area ${auc.toFixed(2)}`}>
      {axes('False alarms, % of on-time loads', 'Delays caught, %')}
      <line x1={mx(0)} y1={my(0)} x2={mx(1)} y2={my(1)} className="diag" />
      <path d={d} className="trend-line" />
      <circle cx={mx(point.fpr)} cy={my(point.tpr)} r={5} className="roc-point" />
      <text x={mx(point.fpr) + 8} y={my(point.tpr) + 14} className="trend-note">
        Current threshold
      </text>
      <text x={mx(0.98)} y={my(0.06)} textAnchor="end" className="trend-note">
        Area under curve {auc.toFixed(2)}
      </text>
    </svg>
  )
}

export function CalibrationChart({ bins }: { bins: { predicted: number; actual: number; n: number }[] }) {
  const top = 0.7
  const sx = (v: number) => mx(v / top)
  const sy = (v: number) => my(v / top)
  const maxN = Math.max(...bins.map((b) => b.n))
  return (
    <svg viewBox={`0 0 ${MW} ${MH}`} className="model-chart" role="img" aria-label="Calibration: predicted against actual late rate">
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((v) => (
        <g key={v}>
          <line x1={sx(0)} x2={sx(top)} y1={sy(v)} y2={sy(v)} className="trend-grid" />
          <text x={sx(0) - 6} y={sy(v) + 4} textAnchor="end" className="trend-axis">
            {Math.round(v * 100)}
          </text>
          <text x={sx(v)} y={MH - 20} textAnchor="middle" className="trend-axis">
            {Math.round(v * 100)}
          </text>
        </g>
      ))}
      <text x={(mx(0) + mx(1)) / 2} y={MH - 3} textAnchor="middle" className="trend-axis strong">
        Predicted chance of delay, %
      </text>
      <text transform={`translate(11 ${(my(0) + my(1)) / 2}) rotate(-90)`} textAnchor="middle" className="trend-axis strong">
        Actually late, %
      </text>
      <line x1={sx(0)} y1={sy(0)} x2={sx(top)} y2={sy(top)} className="diag" />
      <path d={bins.map((b, i) => `${i ? 'L' : 'M'}${sx(b.predicted)},${sy(b.actual)}`).join(' ')} className="trend-line" />
      {bins.map((b) => (
        <circle key={b.predicted} cx={sx(b.predicted)} cy={sy(b.actual)} r={2.5 + 6 * Math.sqrt(b.n / maxN)} className="cal-dot">
          <title>
            Predicted {pct(b.predicted * 100)}, actual {pct(b.actual * 100)}, {int(b.n)} shipments
          </title>
        </circle>
      ))}
    </svg>
  )
}

export function CostCurve({ curve, current, best }: { curve: { t: number; cost: number }[]; current: number; best: number }) {
  const W = 320
  const H = 150
  const P = { l: 12, r: 12, t: 14, b: 26 }
  const hi = Math.max(...curve.map((c) => c.cost))
  const lo = Math.min(...curve.map((c) => c.cost))
  const X = (t: number) => P.l + ((t - 0.05) * (W - P.l - P.r)) / 0.55
  const Y = (c: number) => P.t + ((hi - c) * (H - P.t - P.b)) / (hi - lo || 1)
  const at = curve.reduce((a, c) => (Math.abs(c.t - current) < Math.abs(a.t - current) ? c : a), curve[0])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="model-chart" role="img" aria-label="Cost of mistakes by threshold">
      <path d={curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.t)},${Y(c.cost)}`).join(' ')} className="trend-line" />
      <line x1={X(best)} x2={X(best)} y1={P.t} y2={H - P.b} className="quad" />
      <text x={X(best) + 4} y={P.t + 8} className="trend-note">
        lowest cost
      </text>
      <circle cx={X(at.t)} cy={Y(at.cost)} r={5} className="roc-point" />
      {[0.1, 0.2, 0.3, 0.4, 0.5].map((t) => (
        <text key={t} x={X(t)} y={H - 8} textAnchor="middle" className="trend-axis">
          {Math.round(t * 100)}%
        </text>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ small helpers */

export function StatusDot({ otd }: { otd: number }) {
  return <i className="status-dot" style={{ background: statusColor(otd) }} aria-hidden="true" />
}

export const otdCell = (otd: number) => (
  <span className="otd-cell">
    <StatusDot otd={otd} />
    {pct(otd)}
  </span>
)
