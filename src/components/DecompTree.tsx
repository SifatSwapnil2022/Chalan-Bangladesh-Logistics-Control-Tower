import { useMemo, useState } from 'react'
import type { Shipment } from '../data/generate'
import { hourBand, monthKey } from '../data/metrics'
import { MODE_LABEL, SEGMENTS, hubById } from '../data/network'
import { carrierName } from '../data/scenario'
import { hours, int, monthLabel, pct } from '../lib/format'

export type Dim = 'mode' | 'lane' | 'carrier' | 'reason' | 'segment' | 'dispatch' | 'vehicle' | 'month'
type Metric = 'breaches' | 'hours'

const segLabel = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label]))
export const laneName = (lane: string) => {
  const [a, b] = lane.split('-')
  return `${hubById[a]?.short ?? a} → ${hubById[b]?.short ?? b}`
}

export const DIMS: Record<Dim, { label: string; key: (s: Shipment) => string; name: (k: string) => string }> = {
  mode: { label: 'Mode', key: (s) => s.mode, name: (k) => MODE_LABEL[k as 'road'] },
  lane: { label: 'Lane', key: (s) => s.lane, name: laneName },
  carrier: { label: 'Carrier', key: (s) => s.carrier, name: carrierName },
  reason: { label: 'Delay reason', key: (s) => s.reason ?? 'n/a', name: (k) => k },
  segment: { label: 'Customer segment', key: (s) => s.segment, name: (k) => segLabel[k] ?? k },
  dispatch: { label: 'Dispatch time', key: (s) => hourBand(s.dispatch), name: (k) => k },
  vehicle: { label: 'Vehicle', key: (s) => s.vehicle, name: (k) => k },
  month: { label: 'Delivery month', key: (s) => monthKey(s.delivered!), name: monthLabel },
}

interface Node {
  key: string
  late: number
  n: number
  hours: number
}

const TOP = 7

function biggestPath(list: Shipment[], levels: Dim[], metric: Metric) {
  const val = (n: Node) => (metric === 'breaches' ? n.late : n.hours)
  const p: string[] = []
  let current = list
  for (let i = 0; i < levels.length - 1; i++) {
    const nodes = split(current, levels[i]).filter((n) => n.late > 0)
    if (!nodes.length) break
    const top = nodes.reduce((a, b) => (val(b) > val(a) ? b : a))
    p.push(top.key)
    current = current.filter((s) => DIMS[levels[i]].key(s) === top.key)
  }
  return p
}

function split(list: Shipment[], dim: Dim): Node[] {
  const m = new Map<string, Node>()
  for (const s of list) {
    const k = DIMS[dim].key(s)
    const node = m.get(k) ?? { key: k, late: 0, n: 0, hours: 0 }
    node.n++
    if (s.status === 'late') {
      node.late++
      node.hours += s.delayHours
    }
    m.set(k, node)
  }
  return [...m.values()]
}

/**
 * Decomposition tree, after the Power BI visual of the same name. Each column breaks the
 * selected node of the column before it down by another field. Late shipments only carry a
 * reason, so the reason split is always taken over late loads.
 */
export function DecompTree({ list }: { list: Shipment[] }) {
  const [levels, setLevels] = useState<Dim[]>(['mode', 'lane', 'carrier', 'reason'])
  const [path, setPath] = useState<string[]>(() => biggestPath(list, ['mode', 'lane', 'carrier', 'reason'], 'breaches').slice(0, 2))
  const [metric, setMetric] = useState<Metric>('breaches')
  const val = (n: Node) => (metric === 'breaches' ? n.late : n.hours)
  const fmt = (v: number) => (metric === 'breaches' ? int(v) : hours(v))

  const columns = useMemo(() => {
    const cols: { dim: Dim; nodes: Node[]; total: number; parentN: number }[] = []
    let current = list
    for (let i = 0; i < levels.length; i++) {
      if (i > 0 && path[i - 1] === undefined) break
      if (i > 0) current = current.filter((s) => DIMS[levels[i - 1]].key(s) === path[i - 1])
      const nodes = split(current, levels[i]).filter((n) => n.late > 0)
      nodes.sort((a, b) => val(b) - val(a))
      cols.push({ dim: levels[i], nodes, total: nodes.reduce((a, n) => a + val(n), 0), parentN: current.length })
    }
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, levels, path, metric])

  const root = split(list, 'mode').reduce((a, n) => ({ late: a.late + n.late, n: a.n + n.n, hours: a.hours + n.hours }), { late: 0, n: 0, hours: 0 })

  const followBiggest = () => setPath(biggestPath(list, levels, metric))

  const changeDim = (i: number, d: Dim) => {
    const next = [...levels]
    const clash = next.indexOf(d)
    if (clash > i) next[clash] = levels[i]
    next[i] = d
    setLevels(next)
    setPath(path.slice(0, i))
  }

  return (
    <div className="decomp">
      <div className="decomp-tools">
        <div className="seg" role="radiogroup" aria-label="Measure">
          <button role="radio" aria-checked={metric === 'breaches'} onClick={() => setMetric('breaches')}>
            Late shipments
          </button>
          <button role="radio" aria-checked={metric === 'hours'} onClick={() => setMetric('hours')}>
            Hours of delay
          </button>
        </div>
        <button className="link-btn" onClick={followBiggest}>
          Follow the largest branch
        </button>
        {path.length ? (
          <button className="link-btn" onClick={() => setPath([])}>
            Collapse
          </button>
        ) : null}
      </div>
      <div className="decomp-cols">
        <div className="decomp-col root">
          <p className="decomp-head">All delivered shipments</p>
          <div className="decomp-node on">
            <span className="decomp-name">{int(root.n)}</span>
            <span className="decomp-val">{fmt(metric === 'breaches' ? root.late : root.hours)}</span>
            <span className="decomp-sub">{pct((100 * root.late) / Math.max(1, root.n))} late</span>
          </div>
        </div>
        {columns.map((col, i) => {
          const shown = col.nodes.slice(0, TOP)
          const rest = col.nodes.slice(TOP)
          const used = levels.slice(0, i)
          return (
            <div className="decomp-col" key={i}>
              <label className="decomp-head">
                <span className="sr-only">Split by</span>
                <select value={col.dim} onChange={(e) => changeDim(i, e.target.value as Dim)}>
                  {(Object.keys(DIMS) as Dim[])
                    .filter((d) => !used.includes(d))
                    .map((d) => (
                      <option key={d} value={d}>
                        {DIMS[d].label}
                      </option>
                    ))}
                </select>
              </label>
              {shown.map((n) => {
                const v = val(n)
                const on = path[i] === n.key
                const canGo = i < levels.length - 1
                return (
                  <button
                    key={n.key}
                    className={`decomp-node${on ? ' on' : ''}${path[i] !== undefined && !on ? ' dim' : ''}`}
                    disabled={!canGo}
                    onClick={() => setPath(on ? path.slice(0, i) : [...path.slice(0, i), n.key])}
                  >
                    <span className="decomp-name">{DIMS[col.dim].name(n.key)}</span>
                    <span className="decomp-val">{fmt(v)}</span>
                    <span className="decomp-bar">
                      <i style={{ width: `${(100 * v) / Math.max(1, col.total)}%` }} />
                    </span>
                    <span className="decomp-sub">
                      {pct((100 * v) / Math.max(1, col.total), 0)} of this branch
                      {col.dim !== 'reason' ? ` · ${pct((100 * n.late) / n.n, 0)} late` : ''}
                    </span>
                  </button>
                )
              })}
              {rest.length ? (
                <p className="decomp-rest">
                  {rest.length} more, {fmt(rest.reduce((a, n) => a + val(n), 0))}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
