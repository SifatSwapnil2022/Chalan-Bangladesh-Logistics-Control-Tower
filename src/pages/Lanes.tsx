import { useMemo, useState } from 'react'
import { DataTable, Matrix, Scatter, otdCell, type MatrixCell } from '../components/charts'
import { laneName } from '../components/DecompTree'
import { statusColor } from '../components/NetworkMap'
import { ExportButton, Panel, Segmented } from '../components/ui'
import { groupBy, groupStats, OTD_TARGET, stats } from '../data/metrics'
import { CARRIERS, HUBS, MODE_LABEL, carrierById } from '../data/network'
import { bdt, hours, int, pct } from '../lib/format'
import type { View } from '../state/view'
import { PageHead, scopeText, useSlice } from './common'

type MatrixMetric = 'otd' | 'n' | 'costKg'

export function Lanes({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const [metric, setMetric] = useState<MatrixMetric>('otd')
  const { current, previous } = useSlice(view, { ignoreLane: true })

  /* ---------------- OD matrix */
  const laneStats = useMemo(() => groupStats(current, (s) => s.lane), [current])
  const origins = HUBS.filter((h) => laneStats.some((l) => l.key.startsWith(`${h.id}-`)))
  const dests = HUBS.filter((h) => laneStats.some((l) => l.key.endsWith(`-${h.id}`)))
  const maxN = Math.max(1, ...laneStats.map((l) => l.n))
  const costs = laneStats.map((l) => l.costPerKg)
  const [cLo, cHi] = [Math.min(...costs), Math.max(...costs)]
  const cells: MatrixCell[] = laneStats.map((l) => {
    const [row, col] = l.key.split('-')
    const base = { row, col, key: l.key, title: `${laneName(l.key)}: ${int(l.n)} deliveries, ${pct(l.otd)} on time, ${bdt(l.costPerKg)}/kg` }
    if (metric === 'otd') return { ...base, value: l.otd, display: pct(l.otd, 0), color: statusColor(l.otd), alpha: l.otd >= OTD_TARGET ? 0.2 : l.otd >= 80 ? 0.24 + (0.2 * (OTD_TARGET - l.otd)) / 10 : 0.3 + (0.4 * (80 - Math.max(55, l.otd))) / 25 }
    if (metric === 'n') return { ...base, value: l.n, display: int(l.n), color: 'var(--brand)', alpha: 0.06 + 0.4 * (l.n / maxN) }
    return { ...base, value: l.costPerKg, display: `৳${l.costPerKg.toFixed(1)}`, color: 'var(--brand)', alpha: 0.06 + (0.4 * Math.log(l.costPerKg / cLo)) / Math.log(cHi / cLo || 2) }
  })

  /* ---------------- carrier scorecard */
  const scorecard = useMemo(() => {
    const prevBy = new Map(groupStats(previous, (s) => s.carrier).map((g) => [g.key, g]))
    const rows = groupStats(current, (s) => s.carrier).map((g) => {
      const c = carrierById[g.key]
      const p = prevBy.get(g.key)
      const lanes = new Set(current.filter((s) => s.carrier === g.key).map((s) => s.lane)).size
      return { ...g, name: c.name, mode: c.mode, lanes, change: p && p.n >= 20 ? g.otd - p.otd : null, rank: 0, of: 0 }
    })
    for (const mode of ['road', 'sea', 'air']) {
      const rs = rows.filter((r) => r.mode === mode).sort((a, b) => b.otd - a.otd)
      rs.forEach((r, i) => {
        r.rank = i + 1
        r.of = rs.length
      })
    }
    return rows
  }, [current, previous])

  /* ---------------- cost vs reliability: one bubble per carrier on a lane */
  const scatterMode = view.mode === 'all' ? 'road' : view.mode
  const pairs = useMemo(() => {
    const road = current.filter((s) => s.mode === scatterMode)
    return [...groupBy(road, (s) => `${s.lane}|${s.carrier}`).entries()]
      .map(([k, ss]) => ({ k, ...stats(ss) }))
      .filter((p) => p.n >= 15)
      .map((p) => {
        const [lane, carrier] = p.k.split('|')
        return {
          key: p.k,
          x: p.costPerKg,
          y: p.otd,
          r: p.n,
          label: `${carrierById[carrier].name}, ${laneName(lane)}`,
          detail: `${carrierById[carrier].name} on ${laneName(lane)}: ${pct(p.otd)} on time over ${int(p.n)} deliveries, ৳${p.costPerKg.toFixed(2)} per kg.`,
        }
      })
  }, [current, scatterMode])
  const medianCost = [...pairs].sort((a, b) => a.x - b.x)[Math.floor(pairs.length / 2)]?.x ?? 0

  return (
    <>
      <PageHead title="Lanes and carriers">{scopeText(view)}. The lane filter is ignored on this page so every lane stays comparable.</PageHead>

      <Panel
        title="Origin to destination"
        note="Each cell is one lane. Blank cells are lanes the network does not run. Click a cell to open that lane."
        actions={
          <Segmented
            label="Measure"
            value={metric}
            onChange={setMetric}
            options={[
              { id: 'otd', label: 'On time' },
              { id: 'n', label: 'Deliveries' },
              { id: 'costKg', label: 'Cost per kg' },
            ]}
          />
        }
      >
        <Matrix
          rows={origins.map((h) => ({ id: h.id, label: h.short }))}
          cols={dests.map((h) => ({ id: h.id, label: h.short }))}
          cells={cells}
          rowLabel="From"
          colLabel="To"
          selected={view.lane}
          onCell={(c) => set({ page: 'lane', lane: c.key })}
        />
      </Panel>

      <Panel
        title="Carrier scorecard"
        note="Rank is within the carrier's own mode; comparing a truck company with an airline on cost per kg means nothing. Click a row to filter every page to that carrier."
        actions={
          <ExportButton
            name="carrier-scorecard"
            rows={() =>
              scorecard.map((r) => ({
                carrier_id: r.key,
                carrier: r.name,
                mode: r.mode,
                lanes: r.lanes,
                deliveries: r.n,
                on_time_pct: +r.otd.toFixed(1),
                change_pts: r.change === null ? null : +r.change.toFixed(1),
                breaches: r.breaches,
                avg_delay_h: +r.avgDelay.toFixed(1),
                cost_per_kg_bdt: +r.costPerKg.toFixed(2),
                rank_in_mode: r.rank,
              }))
            }
          />
        }
      >
        <DataTable
          rows={scorecard}
          rowKey={(r) => r.key}
          initialSort={{ key: 'otd', desc: true }}
          onRow={(r) => set({ carrier: view.carrier === r.key ? null : r.key })}
          rowClass={(r) => (view.carrier === r.key ? 'selected' : '')}
          columns={[
            { key: 'name', label: 'Carrier', value: (r) => r.name, render: (r) => <b>{r.name}</b> },
            { key: 'mode', label: 'Mode', value: (r) => r.mode, render: (r) => MODE_LABEL[r.mode], hideSm: true },
            { key: 'lanes', label: 'Lanes', value: (r) => r.lanes, num: true, hideSm: true },
            { key: 'n', label: 'Deliveries', value: (r) => r.n, render: (r) => int(r.n), num: true, hideSm: true },
            { key: 'otd', label: 'On time', value: (r) => r.otd, render: (r) => otdCell(r.otd), num: true, bar: { max: 100, color: (r) => statusColor(r.otd) } },
            { key: 'change', label: 'Change', value: (r) => r.change ?? -999, render: (r) => (r.change === null ? '–' : <span className={r.change >= 0 ? 'good' : 'bad'}>{`${r.change > 0 ? '+' : ''}${r.change.toFixed(1)} pts`}</span>), num: true, hideSm: true },
            { key: 'breaches', label: 'Breaches', value: (r) => r.breaches, render: (r) => int(r.breaches), num: true },
            { key: 'delay', label: 'Avg delay', value: (r) => r.avgDelay, render: (r) => hours(r.avgDelay), num: true, hideSm: true },
            { key: 'kg', label: 'Cost / kg', value: (r) => r.costPerKg, render: (r) => `৳${r.costPerKg.toFixed(2)}`, num: true },
            { key: 'rank', label: 'Rank', value: (r) => r.rank, render: (r) => `${r.rank} of ${r.of}`, num: true },
          ]}
        />
      </Panel>

      <Panel
        title={`Cost against reliability, ${MODE_LABEL[scatterMode].toLowerCase()} carriers by lane`}
        note={
          <>
            One bubble per carrier on a lane, where it made at least 15 deliveries. The vertical line is the median cost per kg; the horizontal one is the {OTD_TARGET}% target. Bubbles in the lower right are paying more for worse service.
            {view.mode === 'all' ? ' Showing road; pick a mode in the filter bar to see sea or air.' : ''}
          </>
        }
      >
        <Scatter points={pairs} xLabel="Cost per kg (৳)" yLabel="On-time delivery" xFmt={(n) => `৳${n.toFixed(n < 10 ? 1 : 0)}`} xSplit={medianCost} onPoint={(p) => set({ page: 'lane', lane: p.key.split('|')[0] })} />
      </Panel>
      <p className="footnote">
        The {CARRIERS.length} carriers are invented. The hubs are real places, but the volumes and on-time rates on them are simulated.
      </p>
    </>
  )
}
