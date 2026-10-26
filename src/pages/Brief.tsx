import { useMemo } from 'react'
import { laneName } from '../components/DecompTree'
import { isDone, OTD_TARGET, stats, windows } from '../data/metrics'
import { DEFAULT_LEVERS, carrierName, runScenario } from '../data/scenario'
import { ALL, MODEL, PIPELINE } from '../data/store'
import { bdt, int, pct } from '../lib/format'
import type { View } from '../state/view'
import { AS_OF } from './common'

const SOURCES = [
  { n: 1, text: 'DCCI seminar on logistics costs, reported by The Business Standard, 29 June 2025', url: 'https://www.tbsnews.net/node/1176496' },
  { n: 2, text: 'World Bank Logistics Performance Index 2023, reported by The Daily Star', url: 'https://www.thedailystar.net/business/economy/news/bangladesh-12-notches-wb-logistics-index-3305406' },
  { n: 3, text: 'Maritime Gateway, Chattogram port dwell time, July 2026', url: 'https://www.maritimegateway.com/chattogram-port-dwell-time/' },
  { n: 4, text: 'Apparel Resources, congestion on the Dhaka–Chattogram highway, 7 August 2025', url: 'https://apparelresources.com/business-news/trade/cargo-congestion-dhaka-chattogram-highway-intensifies-us-tariff-deadline-sparks-surge/' },
]

const Ref = ({ n }: { n: number }) => (
  <sup>
    <a href={`#src-${n}`} onClick={(e) => (e.preventDefault(), document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: 'smooth' }))}>
      {n}
    </a>
  </sup>
)

export function Brief({ set }: { set: (p: Partial<View>) => void }) {
  const f = useMemo(() => {
    const { current } = windows(ALL, '90d')
    const base = stats(current)
    const viaPort = current.filter((s) => s.from === 'CGP' || s.to === 'CGP')
    const portStats = stats(viaPort)
    const year = windows(ALL, '12m').current.filter(isDone)
    const wet = stats(year.filter((s) => s.f.monsoon === 1))
    const dry = stats(year.filter((s) => s.f.monsoon === 0))
    const sc = runScenario(ALL, DEFAULT_LEVERS)
    return { base, portShare: (100 * viaPort.length) / current.length, portBreachShare: (100 * portStats.breaches) / base.breaches, wet, dry, sc, top: sc.carrier.moves[0] }
  }, [])
  const lr = MODEL.results['Logistic regression']
  const go = (page: View['page']) => (e: React.MouseEvent) => {
    e.preventDefault()
    set({ page })
    window.scrollTo(0, 0)
  }

  return (
    <article className="brief">
      <p className="kicker">Case study · simulated data · figures as of {AS_OF}</p>
      <h1>Late freight in Bangladesh, and what one shipper can do about it</h1>
      <p className="lede">
        Chalan is a control tower for a made-up logistics company, Northgate Distribution. It answers three questions a planning team asks every week: where are we late, why, and what would it take to be late less often.
      </p>

      <section>
        <h2>The problem</h2>
        <p>
          Moving goods costs Bangladesh an estimated 15 to 20% of GDP, against 8 to 10% in most economies<Ref n={1} />. In the World Bank's 2023 Logistics Performance Index the country came 88th of 139, and 105th for tracking and tracing, down 26 places<Ref n={2} />.
        </p>
        <p>
          Most of the trade goes through one port. Chattogram handles over 80% of it, and import containers spent 8.3 days there on average in 2024, up from 7.8<Ref n={3} />. The road to it is the other bottleneck: in July 2025 up to 700 trucks a day were arriving at the Sitakunda depots, which can take about 400<Ref n={4} />.
        </p>
        <p>
          For a shipper, all of this turns into missed delivery promises that nobody saw coming. Tracking is often a phone call to the driver and a spreadsheet updated the next morning, so the first sign of a delay is the customer asking where the goods are.
        </p>
      </section>

      <section>
        <h2>The company in this case</h2>
        <p>
          Northgate is invented. It moves garments, FMCG, medicines, e-commerce parcels and electronics on 18 lanes by road, sea and air, with eight carriers, and promises customers {OTD_TARGET}% on time. Its data runs from May 2025 to October 2026: {int(ALL.length)} shipments, generated with the patterns above built in, plus the usual mess (duplicates, three spellings of Chattogram, weights entered in tonnes). Every number on this site is computed from that data when the page loads.
        </p>
      </section>

      <section>
        <h2>What the last 90 days show</h2>
        <div className="findings">
          <a className="finding" href="#/overview" onClick={go('overview')}>
            <b>{pct(f.base.otd)}</b>
            <span>
              on time against a {OTD_TARGET}% target. {int(f.base.breaches)} late deliveries out of {int(f.base.n)}.
            </span>
          </a>
          <a className="finding" href="#/lanes" onClick={go('lanes')}>
            <b>{pct(f.portBreachShare, 0)}</b>
            <span>of the late deliveries were on lanes through Chattogram port, which carry {pct(f.portShare, 0)} of the volume.</span>
          </a>
          {f.top ? (
            <a className="finding" href="#/root-cause" onClick={go('root-cause')}>
              <b>{(f.top.toOtd - f.top.fromOtd).toFixed(0)} pts</b>
              <span>
                between two carriers on the same road. On {laneName(f.top.lane)}, {carrierName(f.top.to)} was on time {pct(f.top.toOtd, 0)} of the time, {carrierName(f.top.from)} {pct(f.top.fromOtd, 0)}.
              </span>
            </a>
          ) : null}
          <a className="finding" href="#/scenario" onClick={go('scenario')}>
            <b>{(f.sc.eid.normalOtd - f.sc.eid.eidOtd).toFixed(0)} pts</b>
            <span>
              lost on road lanes around each Eid ({pct(f.sc.eid.eidOtd, 0)} against {pct(f.sc.eid.normalOtd, 0)}). The monsoon costs another {(f.dry.otd - f.wet.otd).toFixed(0)} points from June to September.
            </span>
          </a>
        </div>
      </section>

      <section>
        <h2>What I would change first</h2>
        <ol className="recs">
          <li>
            <h3>Give more of each road lane to the carrier that is already on time there.</h3>
            <p>
              Moving 30% of the weakest carrier's loads on each lane avoids about {f.sc.carrier.avoided.toFixed(0)} late deliveries a quarter and costs {bdt(f.sc.carrier.costDelta)} more, because the reliable carriers charge more. That is {bdt(f.sc.carrier.costDelta / Math.max(1, f.sc.carrier.avoided))} per breach avoided, which is worth comparing with what a late garment shipment costs in penalties and air-freight rescues.
            </p>
          </li>
          <li>
            <h3>Book Eid trucks two weeks ahead, and load earlier in the day.</h3>
            <p>
              Closing half of the Eid drop is worth about {f.sc.eid.avoided.toFixed(0)} breaches a quarter (they land in the two weeks around each Eid) for roughly {bdt(f.sc.eid.costDelta)}. Moving 40% of evening truck dispatches to the morning adds about {f.sc.offPeak.avoided.toFixed(0)} more for nothing but a loading-bay rota.
            </p>
          </li>
          <li>
            <h3>Start each morning with a call list instead of a spreadsheet.</h3>
            <p>
              The delay-risk model scores a load when it leaves. On months it never saw, checking the {pct(lr.flagged_share * 100, 0)} of loads it flags would have caught {pct(lr.recall * 100, 0)} of the delays before the customer noticed. It is a modest model and the page says so; it is still better than finding out from the customer.
            </p>
          </li>
        </ol>
        <p>
          Together the first two take on-time delivery from {pct(f.sc.base.otd)} to about {pct(f.sc.projected.otd)}. That is nowhere near {OTD_TARGET}%. Most of the remaining delay is congestion at and around the port, which one shipper cannot fix. What the data can do there is put a number on it, for carrier contracts with on-time clauses and for conversations with depot operators.{' '}
          <a href="#/scenario" onClick={go('scenario')}>
            Try other settings in the scenario planner.
          </a>
        </p>
      </section>

      <section>
        <h2>What this does not show</h2>
        <ul className="plain-list">
          <li>The data is simulated. The patterns are realistic in direction and rough size, but the exact figures say nothing about any real company.</li>
          <li>Late-delivery penalties, customer churn and rescue costs are not in the data, so the cost side of every recommendation is the only side with a taka figure on it.</li>
          <li>The model's accuracy is measured on simulated shipments. On real data it would need to be retrained and checked again before anyone relied on it.</li>
        </ul>
      </section>

      <section>
        <h2>How it is built</h2>
        <ol className="pipeline">
          <li>
            <b>Raw export</b>
            <span>{int(PIPELINE.cleaning.raw_rows)} rows of messy CSV, as a TMS would hand it over</span>
          </li>
          <li>
            <b>Cleaning in Python</b>
            <span>Six kinds of issue fixed and counted in a data-quality report</span>
          </li>
          <li>
            <b>PostgreSQL warehouse</b>
            <span>Star schema, KPI views, seven integrity checks that must return zero</span>
          </li>
          <li>
            <b>Delay-risk model</b>
            <span>scikit-learn, time-based split, threshold set by the cost of each kind of mistake</span>
          </li>
          <li>
            <b>Dashboard</b>
            <span>This site (React and TypeScript), plus a Power BI kit with DAX measures and a theme</span>
          </li>
        </ol>
        <p>
          <a href="#/method" onClick={go('method')}>
            Method, definitions and data-quality results
          </a>{' '}
          · <a href="https://github.com/SifatSwapnil2022/chalan-bangladesh-logistics-control-tower">Source code</a>
        </p>
      </section>

      <section className="sources">
        <h2>Sources</h2>
        <ol>
          {SOURCES.map((s) => (
            <li key={s.n} id={`src-${s.n}`}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
