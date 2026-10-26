import { useMemo } from 'react'
import { BarList, DataTable, otdCell } from '../components/charts'
import { laneName } from '../components/DecompTree'
import { statusColor } from '../components/NetworkMap'
import { TrendChart } from '../components/TrendChart'
import { ExportButton, Icon, Panel } from '../components/ui'
import { HOUR } from '../data/generate'
import { groupStats, hourBand, openShipments, OTD_TARGET, reasons, series, stats } from '../data/metrics'
import { LANES, MODE_LABEL } from '../data/network'
import { carrierName } from '../data/scenario'
import { ALL } from '../data/store'
import { bdt, dateLabel, hours, int, pct } from '../lib/format'
import type { View } from '../state/view'
import { Kpi, PageHead, pctChange, scopeText, useSlice } from './common'

const BAND_ORDER = ['Night (0–6)', 'Morning (6–12)', 'Afternoon (12–4 pm)', 'Evening peak (4–10 pm)', 'Late night (10 pm+)']
const laneIds = LANES.map((l) => `${l.from}-${l.to}`)

export function LaneDetail({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const lane = view.lane && laneIds.includes(view.lane) ? view.lane : null
  const { sliced, current, now, prev } = useSlice({ ...view, lane: lane ?? '__none__' })
  const meta = LANES.find((l) => `${l.from}-${l.to}` === lane)
  const sample = useMemo(() => ALL.find((s) => s.lane === lane), [lane])
  const promisedH = useMemo(() => {
    const l = ALL.filter((s) => s.lane === lane).slice(0, 400)
    return l.length ? l.reduce((a, s) => a + (s.promised - s.dispatch) / HOUR, 0) / l.length : 0
  }, [lane])

  const carriers = useMemo(() => groupStats(current, (s) => s.carrier).sort((a, b) => b.n - a.n), [current])
  const bands = useMemo(() => {
    const g = new Map<string, ReturnType<typeof groupStats>[number]>(groupStats(current, (s) => hourBand(s.dispatch) as string).map((x) => [x.key, x]))
    return BAND_ORDER.filter((b) => (g.get(b)?.n ?? 0) >= 5).map((b) => g.get(b)!)
  }, [current])
  const causes = reasons(current)
  const late = current.filter((s) => s.status === 'late').sort((a, b) => b.delivered! - a.delivered!)
  const open = openShipments(sliced)
  const trend = useMemo(() => series(sliced, 'month'), [sliced])

  const picker = (
    <label className="lane-pick">
      <span className="sr-only">Lane</span>
      <select value={lane ?? ''} onChange={(e) => set({ lane: e.target.value || null })}>
        <option value="">Choose a lane…</option>
        {laneIds.map((id) => (
          <option key={id} value={id}>
            {laneName(id)}
          </option>
        ))}
      </select>
    </label>
  )

  if (!lane || !meta) {
    return (
      <>
        <PageHead title="Lane details" aside={picker}>
          Pick a lane, or click one on the map or in any lane table.
        </PageHead>
        <Panel title="All lanes">
          <BarList
            items={groupStats(ALL.filter((s) => s.status === 'on_time' || s.status === 'late'), (s) => s.lane)
              .sort((a, b) => b.n - a.n)
              .map((l) => ({ key: l.key, label: laneName(l.key), sub: `${int(l.n)} deliveries since May 2025`, value: l.otd, display: pct(l.otd), color: statusColor(l.otd) }))}
            max={100}
            onSelect={(k) => k && set({ lane: k })}
          />
        </Panel>
      </>
    )
  }

  const best = carriers.filter((c) => c.n >= 15).sort((a, b) => b.otd - a.otd)

  return (
    <>
      <PageHead
        title={laneName(lane)}
        aside={
          <>
            <button className="icon-btn" onClick={() => set({ page: 'overview' })}>
              <Icon name="back" size={16} />
              <span>Overview</span>
            </button>
            {picker}
          </>
        }
      >
        {MODE_LABEL[meta.mode]}, about {int(sample?.distanceKm ?? 0)} km, promised in {hours(promisedH)} on average. {scopeText(view)}.
      </PageHead>

      <div className="kpis">
        <Kpi label="On-time delivery" value={pct(now.otd)} tone={now.otd >= OTD_TARGET ? 'ok' : now.otd >= 80 ? 'warn' : 'bad'} delta={{ diff: prev.n ? now.otd - prev.otd : null, unit: ' pts', goodWhenUp: true }} />
        <Kpi label="SLA breaches" value={int(now.breaches)} delta={{ diff: pctChange(now.breaches, prev.breaches), unit: '%', goodWhenUp: false }} foot={`of ${int(now.n)} deliveries`} />
        <Kpi label="Average delay when late" value={hours(now.avgDelay)} />
        <Kpi label="Cost per shipment" value={bdt(now.costPerShipment)} foot={`৳${now.costPerKg.toFixed(2)} per kg`} />
        <Kpi label="Open right now" value={int(open.length)} tone={open.some((s) => s.status === 'overdue') ? 'bad' : undefined} foot={`${open.filter((s) => s.status === 'overdue').length} overdue`} />
      </div>

      <div className="grid-2-1">
        <Panel title="On-time delivery by month" note="All history on this lane.">
          <TrendChart points={trend} grain="month" />
        </Panel>
        <Panel title="Why it was late">
          <BarList items={causes.slice(0, 6).map((c) => ({ key: c.reason, label: c.reason, value: c.n, display: `${int(c.n)} · ${pct(c.share * 100, 0)}` }))} />
          {causes.length === 0 ? <p className="empty">No late deliveries in this period.</p> : null}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel
          title="Carriers on this lane"
          note={best.length >= 2 ? `${carrierName(best[0].key)} is ${(best[0].otd - best[best.length - 1].otd).toFixed(0)} points ahead of ${carrierName(best[best.length - 1].key)} here.` : undefined}
        >
          <DataTable
            rows={carriers}
            rowKey={(c) => c.key}
            initialSort={{ key: 'n', desc: true }}
            columns={[
              { key: 'name', label: 'Carrier', value: (c) => carrierName(c.key), render: (c) => <b>{carrierName(c.key)}</b> },
              { key: 'n', label: 'Deliveries', value: (c) => c.n, render: (c) => `${int(c.n)} (${pct((100 * c.n) / Math.max(1, now.n), 0)})`, num: true },
              { key: 'otd', label: 'On time', value: (c) => c.otd, render: (c) => otdCell(c.otd), num: true },
              { key: 'delay', label: 'Avg delay', value: (c) => c.avgDelay, render: (c) => hours(c.avgDelay), num: true, hideSm: true },
              { key: 'kg', label: 'Cost / kg', value: (c) => c.costPerKg, render: (c) => `৳${c.costPerKg.toFixed(2)}`, num: true },
            ]}
          />
        </Panel>
        <Panel title="By dispatch time" note="Local time the load left the origin.">
          <BarList items={bands.map((b) => ({ key: b.key, label: b.key, sub: `${int(b.n)} deliveries`, value: b.otd, display: pct(b.otd), color: statusColor(b.otd) }))} max={100} />
        </Panel>
      </div>

      <Panel
        title="Recent late deliveries"
        actions={<ExportButton name={`late-${lane}`} rows={() => late.map((s) => ({ shipment: s.id, carrier: s.carrier, customer: s.customer, delivered: new Date(s.delivered!).toISOString(), delay_h: s.delayHours, reason: s.reason }))} />}
      >
        <DataTable
          rows={late}
          rowKey={(s) => s.id}
          initialSort={{ key: 'delivered', desc: true }}
          limit={12}
          columns={[
            { key: 'id', label: 'Shipment', value: (s) => s.id, render: (s) => <code>{s.id}</code> },
            { key: 'carrier', label: 'Carrier', value: (s) => carrierName(s.carrier) },
            { key: 'customer', label: 'Customer', value: (s) => s.customer, hideSm: true },
            { key: 'delivered', label: 'Delivered', value: (s) => s.delivered!, render: (s) => dateLabel(s.delivered!), num: true },
            { key: 'delay', label: 'Late by', value: (s) => s.delayHours, render: (s) => hours(s.delayHours), num: true },
            { key: 'reason', label: 'Reason', value: (s) => s.reason ?? '', hideSm: true },
          ]}
        />
      </Panel>
      <p className="footnote">Base for the change figures: {int(prev.n)} deliveries in the period before. Lane stats over all history: {pct(stats(sliced).otd)} on time.</p>
    </>
  )
}
