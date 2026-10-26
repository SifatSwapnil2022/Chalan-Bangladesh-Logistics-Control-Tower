import { useMemo } from 'react'
import { DataTable } from '../components/charts'
import { laneName } from '../components/DecompTree'
import { ExportButton, Icon, Panel } from '../components/ui'
import { OTD_TARGET } from '../data/metrics'
import { DEFAULT_LEVERS, carrierName, runScenario, type Levers } from '../data/scenario'
import { ALL } from '../data/store'
import { bdt, int, pct } from '../lib/format'
import type { View } from '../state/view'
import { PageHead } from './common'

const pack = (l: Levers) => [l.carrierShift, l.offPeak, l.eidCapacity, l.eidPremium].map((x) => Math.round(x * 100)).join('-')
function unpack(s: string | null): Levers {
  const p = (s ?? '').split('-').map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) return DEFAULT_LEVERS
  const c = (x: number, hi: number) => Math.min(hi, Math.max(0, x)) / 100
  return { carrierShift: c(p[0], 100), offPeak: c(p[1], 100), eidCapacity: c(p[2], 100), eidPremium: c(p[3], 30) }
}

function Lever({ id, label, value, max, step, unit, onChange, children }: { id: string; label: string; value: number; max: number; step: number; unit: string; onChange: (v: number) => void; children: React.ReactNode }) {
  return (
    <div className="lever">
      <label htmlFor={id}>
        <span>{label}</span>
        <b>
          {value}
          {unit}
        </b>
      </label>
      <input id={id} type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <p className="lever-note">{children}</p>
    </div>
  )
}

function Bridge({ steps }: { steps: { label: string; value: number; kind: 'total' | 'down' }[] }) {
  const W = 640
  const rowH = 34
  const H = steps.length * rowH + 8
  const L = 170
  const max = Math.max(...steps.filter((s) => s.kind === 'total').map((s) => s.value))
  const lo = Math.min(...steps.filter((s) => s.kind === 'total').map((s) => s.value)) * 0.8
  const X = (v: number) => L + ((v - lo) * (W - L - 70)) / (max - lo)
  let run = steps[0].value
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bridge" role="img" aria-label="Breaches per 90 days, from today to the scenario">
      {steps.map((s, i) => {
        const y = 4 + i * rowH
        let x0: number
        let x1: number
        if (s.kind === 'total') {
          x0 = X(lo)
          x1 = X(s.value)
          run = s.value
        } else {
          x1 = X(run)
          x0 = X(run - s.value)
          run -= s.value
        }
        return (
          <g key={s.label}>
            <text x={L - 10} y={y + rowH / 2 + 4} textAnchor="end" className="bridge-label">
              {s.label}
            </text>
            <rect x={x0} y={y + 6} width={Math.max(1.5, x1 - x0)} height={rowH - 12} className={s.kind === 'total' ? (i === 0 ? 'bridge-base' : 'bridge-total') : 'bridge-down'} rx={2} />
            <text x={x1 + 6} y={y + rowH / 2 + 4} className="bridge-value">
              {s.kind === 'down' ? `−${s.value.toFixed(0)}` : int(Math.round(s.value))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function Scenario({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const levers = unpack(view.lv)
  const r = useMemo(() => runScenario(ALL, levers), [levers.carrierShift, levers.offPeak, levers.eidCapacity, levers.eidPremium]) // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<Levers>) => set({ lv: pack({ ...levers, ...patch }) })
  const avoided = r.base.breaches - r.projected.breaches
  const extra = r.projected.cost - r.base.cost
  const copy = () => {
    try {
      void navigator.clipboard.writeText(window.location.href)
    } catch {
      /* clipboard blocked: the URL bar has the same link */
    }
  }

  return (
    <>
      <PageHead
        title="Scenario planner"
        aside={
          <button className="icon-btn" onClick={copy} title="Copy a link to this scenario">
            <Icon name="link" size={16} />
            <span>Copy link</span>
          </button>
        }
      >
        Three changes a planning team can make without new trucks, roads or a new port. Each one is estimated from the network's own last 90 days, not from an assumed improvement. The page uses all shipments; filters do not apply.
      </PageHead>

      <div className="grid-scenario">
        <Panel title="Levers">
          <Lever id="l1" label="Move volume off the least reliable carrier on each road lane" value={Math.round(levers.carrierShift * 100)} max={100} step={5} unit="%" onChange={(v) => update({ carrierShift: v / 100 })}>
            Moved to the most reliable carrier on the same lane, paying that carrier's rate. Today the gap between them averages {(r.carrier.moves.reduce((a, m) => a + (m.toOtd - m.fromOtd), 0) / Math.max(1, r.carrier.moves.length)).toFixed(0)} points.
          </Lever>
          <Lever id="l2" label="Move evening truck dispatches (4 to 9 pm) earlier in the day" value={Math.round(levers.offPeak * 100)} max={100} step={5} unit="%" onChange={(v) => update({ offPeak: v / 100 })}>
            Evening road loads ran {pct(r.offPeak.peakOtd)} on time against {pct(r.offPeak.offOtd)} for the rest. Small gap, but it costs nothing but a loading-bay rota.
          </Lever>
          <Lever id="l3" label="Book Eid trucks two weeks ahead" value={Math.round(levers.eidCapacity * 100)} max={100} step={5} unit="% of the gap closed" onChange={(v) => update({ eidCapacity: v / 100 })}>
            Around Eid, road on-time drops to {pct(r.eid.eidOtd)} from {pct(r.eid.normalOtd)}. This is the share of that drop that pre-booked capacity would remove.
          </Lever>
          <Lever id="l4" label="Premium for pre-booked Eid capacity" value={Math.round(levers.eidPremium * 100)} max={30} step={1} unit="%" onChange={(v) => update({ eidPremium: v / 100 })}>
            Carriers charge more for guaranteed trucks in the Eid rush. 8% is a guess; change it.
          </Lever>
          <button className="link-btn" onClick={() => set({ lv: null })}>
            Back to the default scenario
          </button>
        </Panel>

        <div className="stack">
          <div className="kpis kpis-3">
            <div className="kpi">
              <p className="kpi-label">On-time delivery</p>
              <p className="kpi-value">
                {pct(r.projected.otd)}
                <small> from {pct(r.base.otd)}</small>
              </p>
              <p className="kpi-note">Target {OTD_TARGET}%</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Breaches per 90 days</p>
              <p className="kpi-value">
                {int(Math.round(r.projected.breaches))}
                <small> from {int(r.base.breaches)}</small>
              </p>
              <p className="kpi-note">{int(Math.round(avoided))} fewer late deliveries</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Extra spend per 90 days</p>
              <p className="kpi-value">{bdt(extra)}</p>
              <p className="kpi-note">{avoided > 0 ? `${bdt(extra / avoided)} per breach avoided` : 'No breaches avoided'}</p>
            </div>
          </div>
          <Panel title="From today's breaches to the scenario" note="Each bar is one lever's share. The three are simply added. They overlap a little (an evening load on a weak carrier counts in both), so the total is slightly generous.">
            <Bridge
              steps={[
                { label: 'Last 90 days', value: r.base.breaches, kind: 'total' },
                { label: 'Carrier shift', value: r.carrier.avoided, kind: 'down' },
                { label: 'Earlier dispatch', value: r.offPeak.avoided, kind: 'down' },
                { label: 'Eid capacity', value: r.eid.avoided, kind: 'down' },
                { label: 'Scenario', value: r.projected.breaches, kind: 'total' },
              ]}
            />
            <p className="panel-foot">
              {r.projected.otd < OTD_TARGET
                ? `Even with every lever at 100% this does not reach ${OTD_TARGET}%. Most of what is left is port and highway congestion around Chattogram, which needs the port authority and the carriers, not a shipper's planning team.`
                : `This reaches the ${OTD_TARGET}% target, but check the cost per breach avoided before treating it as a plan.`}
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Carrier moves, lane by lane"
        note="Only lanes where both carriers made at least 20 deliveries in the last 90 days. Loads per 90 days."
        actions={
          <ExportButton
            name="scenario-carrier-moves"
            rows={() =>
              r.carrier.moves.map((m) => ({
                lane: m.lane,
                from_carrier: m.from,
                to_carrier: m.to,
                loads_moved: +m.moved.toFixed(1),
                from_on_time_pct: +m.fromOtd.toFixed(1),
                to_on_time_pct: +m.toOtd.toFixed(1),
                breaches_avoided: +m.avoided.toFixed(1),
                extra_cost_bdt: Math.round(m.costDelta),
              }))
            }
          />
        }
      >
        <DataTable
          rows={r.carrier.moves}
          rowKey={(m) => m.lane}
          initialSort={{ key: 'avoided', desc: true }}
          onRow={(m) => set({ page: 'lane', lane: m.lane, lv: null })}
          columns={[
            { key: 'lane', label: 'Lane', value: (m) => laneName(m.lane), render: (m) => <b>{laneName(m.lane)}</b> },
            { key: 'from', label: 'Move from', value: (m) => carrierName(m.from), render: (m) => `${carrierName(m.from)} (${pct(m.fromOtd, 0)})` },
            { key: 'to', label: 'To', value: (m) => carrierName(m.to), render: (m) => `${carrierName(m.to)} (${pct(m.toOtd, 0)})`, hideSm: true },
            { key: 'moved', label: 'Loads', value: (m) => m.moved, render: (m) => m.moved.toFixed(0), num: true, hideSm: true },
            { key: 'avoided', label: 'Breaches avoided', value: (m) => m.avoided, render: (m) => m.avoided.toFixed(1), num: true },
            { key: 'cost', label: 'Extra cost', value: (m) => m.costDelta, render: (m) => bdt(m.costDelta), num: true },
          ]}
        />
      </Panel>

      <Panel title="What this assumes">
        <ul className="plain-list">
          <li>The better carrier has spare trucks on that lane and keeps its on-time rate with the extra volume. At 30% of the other carrier's loads that is plausible; at 100% it probably is not.</li>
          <li>An evening load moved to the morning behaves like the morning loads on the same lane. Some customers can only release cargo in the evening, so 100% is not realistic.</li>
          <li>The Eid effect is measured over the last 12 months and spread evenly, a quarter per 90 days. In practice it lands in two weeks around each Eid.</li>
          <li>Cost changes use each carrier's actual average cost per shipment on that lane. Penalties for late delivery are not included, so the benefit side is understated.</li>
        </ul>
      </Panel>
    </>
  )
}
