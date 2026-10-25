import { useMemo } from 'react'
import { NetworkMap, statusColor } from '../components/NetworkMap'
import { TrendChart } from '../components/TrendChart'
import type { Shipment } from '../data/generate'
import { OTD_TARGET, PERIODS, bySlice, hubVolumes, kpis, laneStats, monthly, openShipments, reasons, windows, type Filters } from '../data/metrics'
import { hubById } from '../data/network'
import { bdt, hours, int, pct } from '../lib/format'

function Delta({ now, before, unit, goodWhenUp, fmt }: { now: number; before: number; unit: string; goodWhenUp: boolean; fmt: (n: number) => string }) {
  if (!before) return <span className="delta muted">No earlier data</span>
  const diff = now - before
  if (Math.abs(diff) < 1e-9) return <span className="delta muted">No change</span>
  const good = diff > 0 === goodWhenUp
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}
      {unit} vs previous period
    </span>
  )
}

export function Overview({ all, filters }: { all: Shipment[]; filters: Filters }) {
  const data = useMemo(() => {
    const sliced = bySlice(all, filters)
    const { current, previous } = windows(sliced, filters.period)
    const k = kpis(current)
    const p = kpis(previous)
    const lanes = laneStats(current)
    const open = openShipments(sliced)
    const why = reasons(current)
    const trend = monthly(sliced)
    const vols = hubVolumes(current)
    return { k, p, lanes, open, why, trend, vols, current }
  }, [all, filters])

  const { k, p, lanes, open, why, trend, vols } = data
  const periodLabel = PERIODS.find((x) => x.id === filters.period)!.label
  const worst = [...lanes].filter((l) => l.shipments >= 20).sort((a, b) => a.otd - b.otd).slice(0, 5)
  const corridor = lanes.filter((l) => l.from === 'CGP' || l.to === 'CGP')
  const corridorShare = k.breaches ? corridor.reduce((a, l) => a + l.breaches, 0) / k.breaches : 0
  const maxWhy = Math.max(1, ...why.map((w) => w.n))

  if (!k.delivered) {
    return <p className="empty page">No deliveries match these filters. Widen the period or switch the mode back to all.</p>
  }

  return (
    <div className="page overview">
      <section className="kpis" aria-label="Key figures">
        <div className="kpi">
          <p className="kpi-value" style={{ color: statusColor(k.otd) }}>
            {pct(k.otd)}
          </p>
          <p className="kpi-label">delivered on time</p>
          <Delta now={k.otd} before={p.otd} unit=" pts" goodWhenUp fmt={(n) => n.toFixed(1)} />
        </div>
        <div className="kpi">
          <p className="kpi-value">{int(k.breaches)}</p>
          <p className="kpi-label">SLA breaches out of {int(k.delivered)}</p>
          <Delta now={k.breaches} before={p.breaches} unit="" goodWhenUp={false} fmt={int} />
        </div>
        <div className="kpi">
          <p className="kpi-value">{hours(k.avgDelay)}</p>
          <p className="kpi-label">average delay when late</p>
          <Delta now={k.avgDelay} before={p.avgDelay} unit=" h" goodWhenUp={false} fmt={(n) => n.toFixed(1)} />
        </div>
        <div className="kpi">
          <p className="kpi-value">{bdt(k.costPerShipment)}</p>
          <p className="kpi-label">cost per shipment</p>
          <Delta now={k.costPerShipment} before={p.costPerShipment} unit="" goodWhenUp={false} fmt={bdt} />
        </div>
        <div className="kpi">
          <p className="kpi-value">{int(open.open.length)}</p>
          <p className="kpi-label">shipments on the move now</p>
          <span className={`delta ${open.overdue.length ? 'bad' : 'muted'}`}>
            {open.overdue.length ? `${int(open.overdue.length)} already past their promised time` : 'None past their promised time'}
          </span>
        </div>
      </section>

      <section className="panel map-panel" aria-labelledby="map-h">
        <header className="panel-head">
          <h2 id="map-h">Network, last {periodLabel}</h2>
          <p>Each line is a freight lane. Point at one to see how it is doing.</p>
        </header>
        <NetworkMap lanes={lanes} volumes={vols} />
      </section>

      <aside className="side" aria-label="Summary">
        <section>
          <h2>In short</h2>
          <ul className="brief">
            <li>
              {pct(k.otd)} of {int(k.delivered)} shipments arrived on time, {k.otd >= OTD_TARGET ? 'above' : `${(OTD_TARGET - k.otd).toFixed(1)} points below`} the {OTD_TARGET}% target.
            </li>
            {corridorShare > 0 ? (
              <li>
                Lanes through Chattogram Port carried {pct((100 * corridor.reduce((a, l) => a + l.shipments, 0)) / k.delivered, 0)} of shipments but{' '}
                {pct(100 * corridorShare, 0)} of breaches.
              </li>
            ) : null}
            {why[0] ? (
              <li>
                The most common cause of delay was {why[0].reason.toLowerCase()} ({pct(100 * why[0].share, 0)} of late shipments).
              </li>
            ) : null}
            <li>
              Freight spend was {bdt(k.totalCost)}, or {bdt(k.costPerKg)} per kg.
            </li>
          </ul>
        </section>

        <section>
          <h2>Lanes to watch</h2>
          <table className="watch">
            <thead>
              <tr>
                <th>Lane</th>
                <th className="num">On time</th>
                <th className="num">Breaches</th>
              </tr>
            </thead>
            <tbody>
              {worst.map((l) => (
                <tr key={l.lane}>
                  <td>
                    {hubById[l.from].short} to {hubById[l.to].short}
                  </td>
                  <td className="num" style={{ color: statusColor(l.otd) }}>
                    {pct(l.otd)}
                  </td>
                  <td className="num">{int(l.breaches)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </aside>

      <section className="panel trend-panel" aria-labelledby="trend-h">
        <header className="panel-head">
          <h2 id="trend-h">On-time delivery by month</h2>
          <p>Every month in the data. Delays rise in the monsoon and around Eid.</p>
        </header>
        <TrendChart points={trend} />
      </section>

      <section className="panel why-panel" aria-labelledby="why-h">
        <header className="panel-head">
          <h2 id="why-h">Why shipments were late</h2>
          <p>Last {periodLabel}, by number of late shipments.</p>
        </header>
        <ul className="bars">
          {why.slice(0, 7).map((w) => (
            <li key={w.reason}>
              <span className="bar-label">{w.reason}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(100 * w.n) / maxWhy}%` }} />
              </span>
              <span className="num">{int(w.n)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
