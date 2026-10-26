import { useMemo, useState } from 'react'
import { DataTable } from '../components/charts'
import { laneName } from '../components/DecompTree'
import { ExportButton, Panel, Segmented } from '../components/ui'
import { HOUR, NOW, type Shipment } from '../data/generate'
import { openShipments } from '../data/metrics'
import { carrierName } from '../data/scenario'
import { MODEL, riskOf } from '../data/store'
import { bdt, dateLabel, int } from '../lib/format'
import type { View } from '../state/view'
import { AS_OF, Kpi, PageHead, useSlice } from './common'

type Tab = 'all' | 'overdue' | 'risk' | 'due'
const STORE_KEY = 'chalan.handled'

interface Row {
  s: Shipment
  left: number
  risk: number | null
  action: string
  priority: number
}

function suggest(s: Shipment, left: number, risk: number | null) {
  const high = risk !== null && risk >= MODEL.threshold
  if (left < 0) return 'Call the carrier for a new ETA, then tell the customer'
  if (high && s.mode === 'road' && (s.to === 'CGP' || s.from === 'CGP')) return 'Check the port gate slot with the depot'
  if (high && left <= 12) return 'Warn the customer before the promised time'
  if (high) return 'Check-call the driver at the next stop'
  return 'Normal tracking'
}

function loadHandled(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

const fmtLeft = (h: number) => {
  const a = Math.abs(h)
  const t = a >= 48 ? `${Math.round(a / 24)} days` : `${Math.round(a)} h`
  return h < 0 ? `${t} overdue` : `${t} left`
}

export function Exceptions({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const [tab, setTab] = useState<Tab>('all')
  const [handled, setHandled] = useState<Set<string>>(loadHandled)
  const { sliced } = useSlice(view)

  const rows: Row[] = useMemo(
    () =>
      openShipments(sliced).map((s) => {
        const left = (s.promised - NOW) / HOUR
        const risk = riskOf(s.id)
        return { s, left, risk, action: suggest(s, left, risk), priority: left < 0 ? 2 + -left / 1000 : (risk ?? 0) }
      }),
    [sliced],
  )

  const toggle = (id: string) => {
    const next = new Set(handled)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHandled(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...next]))
    } catch {
      /* storage unavailable: keep it for this visit only */
    }
  }

  const overdue = rows.filter((r) => r.left < 0)
  const risky = rows.filter((r) => r.left >= 0 && r.risk !== null && r.risk >= MODEL.threshold)
  const due = rows.filter((r) => r.left >= 0 && r.left <= 24)
  const shown = tab === 'overdue' ? overdue : tab === 'risk' ? risky : tab === 'due' ? due : rows
  const valueAtRisk = [...overdue, ...risky].reduce((a, r) => a + r.s.cargoValueBdt, 0)

  return (
    <>
      <PageHead title="Exceptions">
        Shipments still on the road, at sea or in the air at {AS_OF}. Overdue loads come first, then the rest by the model's delay risk. Ticks are saved in this browser only.
      </PageHead>

      <div className="kpis kpis-4">
        <Kpi label="Open shipments" value={int(rows.length)} foot={`${int(handled.size)} ticked as handled`} />
        <Kpi label="Overdue" value={int(overdue.length)} tone={overdue.length ? 'bad' : 'ok'} foot="Past the promised time, not delivered" />
        <Kpi label="High delay risk" value={int(risky.length)} tone={risky.length ? 'warn' : undefined} foot={`Risk score ${Math.round(MODEL.threshold * 100)}% or more, not yet due`} />
        <Kpi label="Cargo value in those two groups" value={bdt(valueAtRisk)} foot="Declared value, not the cost of the delay" />
      </div>

      <Panel
        title="Call list"
        actions={
          <>
            <Segmented
              label="Show"
              value={tab}
              onChange={setTab}
              options={[
                { id: 'all', label: `All ${rows.length}` },
                { id: 'overdue', label: `Overdue ${overdue.length}` },
                { id: 'risk', label: `High risk ${risky.length}` },
                { id: 'due', label: `Due in 24 h ${due.length}` },
              ]}
            />
            <ExportButton
              name={`exceptions-${tab}`}
              rows={() =>
                shown.map((r) => ({
                  shipment: r.s.id,
                  lane: r.s.lane,
                  carrier: r.s.carrier,
                  customer: r.s.customer,
                  segment: r.s.segment,
                  dispatched: new Date(r.s.dispatch).toISOString(),
                  promised: new Date(r.s.promised).toISOString(),
                  hours_left: +r.left.toFixed(1),
                  risk: r.risk,
                  cargo_value_bdt: r.s.cargoValueBdt,
                  suggested_action: r.action,
                  handled: handled.has(r.s.id) ? 'yes' : 'no',
                }))
              }
            />
          </>
        }
      >
        <DataTable
          rows={shown}
          rowKey={(r) => r.s.id}
          initialSort={{ key: 'priority', desc: true }}
          rowClass={(r) => (handled.has(r.s.id) ? 'handled' : r.left < 0 ? 'row-bad' : '')}
          limit={25}
          empty="Nothing open for these filters."
          columns={[
            {
              key: 'done',
              label: '',
              width: '36px',
              value: (r) => (handled.has(r.s.id) ? 1 : 0),
              render: (r) => <input type="checkbox" aria-label={`Mark ${r.s.id} handled`} checked={handled.has(r.s.id)} onChange={() => toggle(r.s.id)} onClick={(e) => e.stopPropagation()} />,
            },
            { key: 'id', label: 'Shipment', value: (r) => r.s.id, render: (r) => <code>{r.s.id}</code> },
            {
              key: 'lane',
              label: 'Lane',
              value: (r) => laneName(r.s.lane),
              render: (r) => (
                <a href={`#/lane?lane=${r.s.lane}`} onClick={(e) => (e.preventDefault(), set({ page: 'lane', lane: r.s.lane }))}>
                  {laneName(r.s.lane)}
                </a>
              ),
            },
            { key: 'carrier', label: 'Carrier', value: (r) => carrierName(r.s.carrier), hideSm: true },
            { key: 'customer', label: 'Customer', value: (r) => r.s.customer, hideSm: true },
            { key: 'promised', label: 'Promised', value: (r) => r.s.promised, render: (r) => dateLabel(r.s.promised), hideSm: true },
            { key: 'left', label: 'Time', value: (r) => r.left, render: (r) => <span className={r.left < 0 ? 'bad' : r.left <= 24 ? 'warn-text' : ''}>{fmtLeft(r.left)}</span>, num: true },
            {
              key: 'priority',
              label: 'Risk',
              value: (r) => r.priority,
              render: (r) => (r.risk === null ? '–' : <span className={`risk-pill${r.risk >= MODEL.threshold ? ' high' : ''}`}>{Math.round(r.risk * 100)}%</span>),
              num: true,
            },
            { key: 'value', label: 'Cargo value', value: (r) => r.s.cargoValueBdt, render: (r) => bdt(r.s.cargoValueBdt), num: true, hideSm: true },
            { key: 'action', label: 'Suggested next step', value: (r) => r.action, render: (r) => <span className={`wrap${r.action === 'Normal tracking' ? ' muted' : ''}`}>{r.action}</span> },
          ]}
        />
      </Panel>
      <p className="footnote">
        The suggested step is a simple rule, written down so it can be argued with: overdue loads get a call to the carrier; risky loads bound for the port get a gate-slot check; risky loads due within 12 hours get a heads-up to the customer. The risk score comes from the model on the Delay risk page.
      </p>
    </>
  )
}
