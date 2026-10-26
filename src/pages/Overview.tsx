import { useMemo, useState } from 'react'
import { BarList, DataTable, otdCell } from '../components/charts'
import { laneName } from '../components/DecompTree'
import { NetworkMap, statusColor, type LaneRow } from '../components/NetworkMap'
import { TrendChart } from '../components/TrendChart'
import { ExportButton, Panel, Segmented } from '../components/ui'
import { NOW } from '../data/generate'
import { groupStats, lastWeeks, OTD_TARGET, openShipments, reasons, series } from '../data/metrics'
import { SEGMENTS, hubById } from '../data/network'
import { bdt, hours, int, pct } from '../lib/format'
import type { View } from '../state/view'
import { Kpi, PageHead, pctChange, scopeText, useSlice } from './common'

export function Overview({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const [grain, setGrain] = useState<'month' | 'week'>('month')
  const { sliced, current, previous, now, prev } = useSlice(view)
  const network = useSlice(view, { ignoreLane: true })

  const weeks = useMemo(() => lastWeeks(sliced, 13).slice(0, -1), [sliced])
  const trend = useMemo(() => {
    const s = series(sliced, grain)
    return grain === 'month' ? s.slice(0, -1).concat(s.slice(-1)) : s.slice(-27, -1)
  }, [sliced, grain])
  const open = useMemo(() => openShipments(sliced), [sliced])
  const overdue = open.filter((s) => s.status === 'overdue').length

  const lanes: (LaneRow & { prevOtd: number | null })[] = useMemo(() => {
    const prevBy = new Map(groupStats(network.previous, (s) => s.lane).map((g) => [g.key, g]))
    return groupStats(network.current, (s) => s.lane).map((g) => {
      const [from, to] = g.key.split('-')
      const any = network.current.find((s) => s.lane === g.key)!
      return { ...g, from, to, mode: any.mode, prevOtd: prevBy.get(g.key)?.otd ?? null }
    })
  }, [network.current, network.previous])

  const watch = lanes
    .filter((l) => l.n >= 20 && l.otd < OTD_TARGET)
    .map((l) => ({ ...l, change: l.prevOtd === null ? null : l.otd - l.prevOtd }))

  const causes = reasons(current)
  const segs = groupStats(network.current.filter((s) => !view.lane || s.lane === view.lane), (s) => s.segment).sort((a, b) => b.breaches - a.breaches)
  const segLabel = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label]))
  const dueToday = open.filter((s) => s.status === 'in_transit' && s.promised - NOW < 24 * 3_600_000).length

  return (
    <>
      <PageHead title="Overview">{scopeText(view)}. On-time means delivered by the promised time; the contract target is {OTD_TARGET}%.</PageHead>

      <div className="kpis">
        <Kpi
          label="On-time delivery"
          value={pct(now.otd)}
          tone={now.otd >= OTD_TARGET ? 'ok' : now.otd >= 80 ? 'warn' : 'bad'}
          tip="Delivered on or before the promised time, as a share of all deliveries in the period. In-transit loads are not counted until they arrive."
          delta={{ diff: prev.n ? now.otd - prev.otd : null, unit: ' pts', goodWhenUp: true }}
          spark={weeks.map((w) => w.otd)}
          foot={`${(now.otd - OTD_TARGET).toFixed(1)} pts against the ${OTD_TARGET}% target`}
        />
        <Kpi
          label="SLA breaches"
          value={int(now.breaches)}
          tip="Deliveries that arrived after the promised time."
          delta={{ diff: pctChange(now.breaches, prev.breaches), unit: '%', goodWhenUp: false }}
          spark={weeks.map((w) => w.breaches)}
          sparkColor="var(--ink-2)"
          foot={`out of ${int(now.n)} deliveries`}
        />
        <Kpi
          label="Average delay when late"
          value={hours(now.avgDelay)}
          tip="Hours past the promised time, averaged over late deliveries only. Sea lanes pull this up: a late vessel is usually days, not hours."
          delta={{ diff: prev.n ? now.avgDelay - prev.avgDelay : null, unit: ' h', goodWhenUp: false }}
          spark={weeks.map((w) => w.avgDelay)}
          sparkColor="var(--ink-2)"
        />
        <Kpi
          label="Cost per shipment"
          value={bdt(now.costPerShipment)}
          tip="Freight, surcharges and handling, divided by deliveries. Mixes modes, so watch the trend rather than the level."
          delta={{ diff: pctChange(now.costPerShipment, prev.costPerShipment), unit: '%', goodWhenUp: false }}
          spark={weeks.map((w) => w.costPerShipment)}
          sparkColor="var(--ink-2)"
          foot={`${bdt(now.cost)} in total`}
        />
        <Kpi
          label="Open right now"
          value={int(open.length)}
          tone={overdue ? 'bad' : undefined}
          tip="Shipments dispatched but not yet delivered, at the time of the last data load."
          foot={
            <>
              <a href={`#/exceptions`} onClick={(e) => (e.preventDefault(), set({ page: 'exceptions' }))}>
                {overdue} overdue
              </a>
              , {dueToday} more due within 24 hours
            </>
          }
        />
      </div>

      <div className="grid-map">
        <Panel title="Lanes" note={view.lane ? `Filtered to ${laneName(view.lane)}.` : 'Domestic lanes on the map, sea and air below it.'} className="panel-map">
          <NetworkMap lanes={lanes} selected={view.lane} onSelect={(lane) => set({ lane })} onOpen={(lane) => set({ page: 'lane', lane })} />
        </Panel>
        <div className="stack">
          <Panel
            title="On-time delivery over time"
            note="All history for the current filters, not just the selected period."
            actions={<Segmented label="Grain" value={grain} onChange={setGrain} options={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }]} />}
          >
            <TrendChart points={trend} grain={grain} />
          </Panel>
          <div className="grid-2">
            <Panel
              title="Why shipments were late"
              note={`${int(current.filter((s) => s.status === 'late').length)} late deliveries, by the reason the carrier gave.`}
              actions={<ExportButton name="delay-reasons" rows={() => causes.map((c) => ({ reason: c.reason, late_shipments: c.n, share: +(c.share * 100).toFixed(1), delay_hours: Math.round(c.hours) }))} />}
            >
              <BarList items={causes.slice(0, 7).map((c) => ({ key: c.reason, label: c.reason, value: c.n, display: `${int(c.n)} · ${pct(c.share * 100, 0)}` }))} />
            </Panel>
            <Panel title="Breaches by customer segment" note="Click a segment to filter the page.">
              <BarList
                items={segs.map((g) => ({ key: g.key, label: segLabel[g.key], sub: `${pct(g.otd)} on time`, value: g.breaches, display: int(g.breaches), color: statusColor(g.otd) }))}
                selected={view.segment === 'all' ? null : view.segment}
                onSelect={(k) => set({ segment: (k ?? 'all') as View['segment'] })}
              />
            </Panel>
          </div>
        </div>
      </div>

      <Panel
        title="Lanes below target"
        note={`Lanes with at least 20 deliveries in the period and on-time below ${OTD_TARGET}%. Click a row for the lane's own page.`}
        actions={<ExportButton name="lanes-below-target" rows={() => watch.map((l) => ({ lane: l.key, deliveries: l.n, on_time_pct: +l.otd.toFixed(1), change_pts: l.change === null ? null : +l.change.toFixed(1), breaches: l.breaches, avg_delay_h: +l.avgDelay.toFixed(1), cost_per_shipment_bdt: Math.round(l.costPerShipment) }))} />}
      >
        <DataTable
          rows={watch}
          rowKey={(r) => r.key}
          initialSort={{ key: 'breaches', desc: true }}
          onRow={(r) => set({ page: 'lane', lane: r.key })}
          empty="Every lane with enough volume is on target for these filters."
          columns={[
            { key: 'lane', label: 'Lane', value: (r) => laneName(r.key), render: (r) => <b>{laneName(r.key)}</b> },
            { key: 'mode', label: 'Mode', value: (r) => r.mode, render: (r) => <span className="muted">{r.mode}</span>, hideSm: true },
            { key: 'n', label: 'Deliveries', value: (r) => r.n, render: (r) => int(r.n), num: true, hideSm: true },
            { key: 'otd', label: 'On time', value: (r) => r.otd, render: (r) => otdCell(r.otd), num: true },
            { key: 'change', label: 'Change', value: (r) => r.change ?? 0, render: (r) => (r.change === null ? '–' : <span className={r.change >= 0 ? 'good' : 'bad'}>{`${r.change > 0 ? '+' : ''}${r.change.toFixed(1)} pts`}</span>), num: true },
            { key: 'breaches', label: 'Breaches', value: (r) => r.breaches, render: (r) => int(r.breaches), num: true, bar: { max: Math.max(1, ...watch.map((w) => w.breaches)), color: () => 'var(--bar-bad)' } },
            { key: 'delay', label: 'Avg delay', value: (r) => r.avgDelay, render: (r) => hours(r.avgDelay), num: true, hideSm: true },
            { key: 'cost', label: 'Cost / shipment', value: (r) => r.costPerShipment, render: (r) => bdt(r.costPerShipment), num: true, hideSm: true },
            { key: 'via', label: 'Port', value: (r) => (r.from === 'CGP' || r.to === 'CGP' ? 1 : 0), render: (r) => (r.from === 'CGP' || r.to === 'CGP' ? <span className="tag">via {hubById.CGP.short}</span> : ''), hideSm: true },
          ]}
        />
      </Panel>
      <p className="footnote">
        Previous period for the change figures: the {view.period === '30d' ? '30' : view.period === '90d' ? '90' : view.period === '12m' ? '365' : '543'} days before this one. {int(previous.length)} deliveries in it.
      </p>
    </>
  )
}
