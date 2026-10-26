import { Panel } from '../components/ui'
import { OTD_TARGET } from '../data/metrics'
import { MODEL, PIPELINE } from '../data/store'
import { int } from '../lib/format'
import { AS_OF, PageHead } from './common'

const REPO = 'https://github.com/SifatSwapnil2022/chalan-bangladesh-logistics-control-tower'
const file = (path: string) => `${REPO}/blob/main/${path}`

const STEPS = [
  {
    name: 'Simulate and export',
    files: ['src/data/generate.ts', 'scripts/export-raw.ts'],
    text: 'A seeded generator creates shipments on 18 lanes from May 2025. Delay odds rise with the monsoon, the days around Eid, monthly congestion at Chattogram, evening dispatch on the highway, a busy week at the origin hub and a less reliable carrier. The export then breaks the data the way real exports are broken.',
  },
  {
    name: 'Clean',
    files: ['analytics/pipeline/clean.py', 'analytics/reports/DATA_QUALITY_REPORT.md'],
    text: 'pandas script that removes duplicates, maps hub spellings to codes, fixes dates and units, and writes a report with a row count for each fix. Nothing is dropped silently.',
  },
  {
    name: 'Load the warehouse',
    files: ['analytics/sql/01_schema.sql', 'analytics/sql/02_views.sql', 'analytics/sql/03_checks.sql', 'analytics/pipeline/load_postgres.py'],
    text: 'PostgreSQL 16, star schema: one fact table of shipments and dimensions for hub, carrier, customer, lane and date, plus port-congestion and holiday reference tables. KPI views feed Power BI directly.',
  },
  {
    name: 'Train the delay-risk model',
    files: ['analytics/pipeline/train_model.py', 'analytics/reports/MODEL_REPORT.md'],
    text: 'Only fields known at dispatch. Trained on the first 10 months, threshold and model picked on the next two, scored once on the last six. The carrier\'s recent on-time rate is computed from deliveries completed before each dispatch, so the model never sees the future.',
  },
  {
    name: 'Report',
    files: ['src/', 'analytics/powerbi/BUILD_GUIDE.md', 'analytics/powerbi/DAX_MEASURES.md'],
    text: 'This site, built with React, TypeScript and hand-drawn SVG charts, and a Power BI kit (theme, DAX measures, page plan) for teams that work in Power BI.',
  },
]

const DEFS = [
  ['On-time delivery (OTD)', 'Deliveries on or before the promised time ÷ all deliveries in the period. Counted on the delivery date. Open shipments are left out until they arrive.'],
  ['SLA breach', 'A delivery after the promised time, by any margin.'],
  ['Average delay', 'Hours past the promised time, averaged over late deliveries only.'],
  ['Cost per shipment', 'Freight + surcharges + handling, ÷ deliveries. Mixes modes, so compare like with like.'],
  ['Cost per kg', 'Total cost ÷ total weight. Used to compare carriers within one mode.'],
  ['Open, overdue', 'Dispatched and not delivered at the data cut-off. Overdue if the promised time has already passed.'],
  ['Delay risk', 'Model probability, at dispatch, that the shipment will miss its promised time.'],
  ['Previous period', 'The same number of days immediately before the selected period.'],
]

const BI = [
  ['Cross-filtering', 'Click a lane on the map, a segment bar or a carrier row; every chart on the page follows.'],
  ['Drill-through', 'Any lane opens its own page with the filters carried over.'],
  ['Decomposition tree', 'Root cause page. Split late shipments by any field, in any order.'],
  ['Key influencers', 'Root cause page. Raw late-rate comparisons beside model odds ratios.'],
  ['What-if parameters', 'Scenario page. Three levers and a cost assumption.'],
  ['Bookmarks', 'Every view, filter and scenario setting is in the URL. Copy it to share the exact view.'],
  ['Export data', 'CSV button on every table.'],
]

export function Method() {
  const c = PIPELINE.cleaning
  return (
    <>
      <PageHead title="Method">How the numbers are produced, what they mean and how far to trust them. Data cut-off: {AS_OF}.</PageHead>

      <Panel title="Pipeline">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <span className="step-n">{i + 1}</span>
              <div>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <p className="step-files">
                  {s.files.map((f) => (
                    <a key={f} href={file(f)} target="_blank" rel="noreferrer">
                      <code>{f}</code>
                    </a>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid-2">
        <Panel title="Data quality" note={`${int(c.raw_rows)} raw rows in, ${int(c.clean_rows)} shipments out. ${int(c.scored_rows)} are delivered and scored; ${int(c.in_transit)} were still moving at the cut-off.`}>
          <div className="table-wrap">
            <table className="table static">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>What was done</th>
                  <th className="num">Rows</th>
                </tr>
              </thead>
              <tbody>
                {c.issues.map((i) => (
                  <tr key={i.issue}>
                    <td>
                      <b>{i.issue}</b>
                    </td>
                    <td>{i.action}</td>
                    <td className="num">{int(i.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Warehouse checks" note="Run after every load. Each query returns the rows that break a rule, so the right answer is always zero.">
          <div className="table-wrap">
            <table className="table static">
              <thead>
                <tr>
                  <th>Rule broken</th>
                  <th className="num">Rows</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE.postgres.checks.map((ch) => (
                  <tr key={ch.check}>
                    <td>{ch.check[0].toUpperCase() + ch.check.slice(1)}</td>
                    <td className={`num ${ch.rows ? 'bad' : 'good'}`}>{ch.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-foot">
            Tables: {PIPELINE.postgres.tables.join(', ')}. Views: {PIPELINE.postgres.views.join(', ')}.
          </p>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Definitions" note={`The contract target used throughout is ${OTD_TARGET}% on time.`}>
          <dl className="defs">
            {DEFS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Power BI features, and where they are here" note="The same measures exist as DAX in the Power BI kit, so the numbers match if the model is rebuilt there.">
          <dl className="defs">
            {BI.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title="Limits">
        <ul className="plain-list">
          <li>All shipments are simulated. Hubs, distances, holidays and seasons are real; carriers, customers and volumes are not.</li>
          <li>The generator decides what causes delay, and the model then finds those causes. That shows the method works end to end; it does not prove these are the causes in real Bangladeshi freight.</li>
          <li>
            The model ({MODEL.chosen.toLowerCase()}, ROC-AUC {MODEL.results['Logistic regression'].roc_auc.toFixed(2)}) is modest on purpose: delays in the data have a large random part, as real ones do.
          </li>
          <li>Eid dates are fixed to the expected day. The real date depends on the moon sighting and can move by one day.</li>
        </ul>
      </Panel>
    </>
  )
}
