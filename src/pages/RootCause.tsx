import { useMemo } from 'react'
import { DecompTree, laneName } from '../components/DecompTree'
import { InfoTip, Panel } from '../components/ui'
import type { Shipment } from '../data/generate'
import { isDone, windows } from '../data/metrics'
import { carrierName } from '../data/scenario'
import { MODEL } from '../data/store'
import { int, pct } from '../lib/format'
import type { View } from '../state/view'
import { PageHead, scopeText, useSlice } from './common'

interface Factor {
  label: string
  scope: string
  within: (s: Shipment) => boolean
  test: (s: Shipment) => boolean
}

const FACTORS: Factor[] = [
  { label: 'Monsoon months (June to September)', scope: 'all shipments', within: () => true, test: (s) => s.f.monsoon === 1 },
  { label: 'Dispatched in the 10 days before Eid or 4 days after', scope: 'all shipments', within: () => true, test: (s) => s.f.eid === 1 },
  { label: 'Chattogram port congestion index 0.8 or higher', scope: 'loads through the port', within: (s) => s.from === 'CGP' || s.to === 'CGP', test: (s) => s.f.port >= 0.8 },
  { label: 'Origin hub 15% busier than its normal week', scope: 'all shipments', within: () => true, test: (s) => s.f.load >= 1.15 },
  { label: 'Truck dispatched between 4 pm and 9 pm', scope: 'road shipments', within: (s) => s.mode === 'road', test: (s) => s.f.peakHour === 1 },
  { label: 'Dispatched on a Friday', scope: 'all shipments', within: () => true, test: (s) => s.f.friday === 1 },
]

const lateRate = (l: Shipment[]) => (l.length ? (100 * l.filter((s) => s.status === 'late').length) / l.length : 0)

function readable(factor: string) {
  if (factor.startsWith('Carrier ')) return `Carrier: ${carrierName(factor.slice(8))}`
  if (factor.startsWith('Lane ')) return `Lane: ${laneName(factor.slice(5))}`
  return factor
}

export function RootCause({ view }: { view: View }) {
  const { sliced, current } = useSlice(view)

  // Eid and the monsoon only happen once a year, so influencers always use 12 months
  const year = useMemo(() => windows(sliced, '12m').current.filter(isDone), [sliced])
  const factors = useMemo(
    () =>
      FACTORS.map((f) => {
        const pool = year.filter(f.within)
        const yes = pool.filter(f.test)
        const no = pool.filter((s) => !f.test(s))
        const a = lateRate(yes)
        const b = lateRate(no)
        return { ...f, yes: yes.length, a, b, ratio: b ? a / b : 0 }
      })
        .filter((f) => f.yes >= 30)
        .sort((x, y) => y.ratio - x.ratio),
    [year],
  )
  const maxRatio = Math.max(2, ...factors.map((f) => f.ratio))
  const raises = MODEL.influencers.filter((i) => i.odds_ratio > 1).sort((a, b) => b.odds_ratio - a.odds_ratio)
  const lowers = MODEL.influencers.filter((i) => i.odds_ratio < 1).sort((a, b) => a.odds_ratio - b.odds_ratio)

  return (
    <>
      <PageHead title="Root cause">{scopeText(view)}. Start from all deliveries and keep splitting until the branch that holds most of the delay is obvious.</PageHead>

      <Panel title="Where the late shipments are" note="Click a box to break it down further. Change what each column splits by with the drop-down at its top.">
        <DecompTree list={current} key={`${view.period}${view.mode}${view.segment}${view.carrier}${view.lane}`} />
      </Panel>

      <div className="grid-2">
        <Panel
          title="What goes with being late"
          note={`Late rate when the condition holds, against the rest of the same group. Last 12 months (${int(year.length)} deliveries) so that Eid and the monsoon are both in it.`}
        >
          <ul className="influencers">
            {factors.map((f) => (
              <li key={f.label}>
                <p className="inf-label">
                  {f.label}
                  <small>
                    {int(f.yes)} {f.scope === 'all shipments' ? 'shipments' : f.scope}
                  </small>
                </p>
                <p className="inf-figures">
                  <b>{pct(f.a, 0)}</b> late, against {pct(f.b, 0)} otherwise
                </p>
                <span className="inf-bar">
                  <i style={{ width: `${(100 * f.ratio) / maxRatio}%` }} className={f.ratio >= 1.15 ? 'up' : f.ratio <= 0.9 ? 'down' : ''} />
                  <span>{f.ratio.toFixed(2)}×</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="panel-foot">
            These are raw comparisons. Monsoon and port congestion peak in the same months, so some of each one's effect belongs to the other. The model on the right separates them.
          </p>
        </Panel>

        <Panel
          title="The same question, with everything else held equal"
          note={
            <>
              Odds ratios from the delay-risk model (logistic regression on 15,430 shipments). 1.30 means the odds of a delay are 30% higher.
              <InfoTip text="Carrier and lane effects are against the average carrier or lane. Continuous factors are per one standard deviation, roughly the gap between a normal week and a bad one." />
            </>
          }
        >
          <div className="odds">
            <div>
              <p className="odds-head bad">Raises the risk</p>
              {raises.map((i) => (
                <p key={i.factor} className="odds-row">
                  <span>{readable(i.factor)}</span>
                  <b>{i.odds_ratio.toFixed(2)}</b>
                </p>
              ))}
            </div>
            <div>
              <p className="odds-head good">Lowers the risk</p>
              {lowers.map((i) => (
                <p key={i.factor} className="odds-row">
                  <span>{readable(i.factor)}</span>
                  <b>{i.odds_ratio.toFixed(2)}</b>
                </p>
              ))}
            </div>
          </div>
          <p className="panel-foot">
            Carrier choice is the largest single lever that is under the shipper's control. Weather and Eid are not, but they are known weeks ahead, which is what the scenario page uses.
          </p>
        </Panel>
      </div>
    </>
  )
}
