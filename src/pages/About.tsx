import { OTD_TARGET } from '../data/metrics'

const KPIS: [string, string, string][] = [
  ['On-time delivery (OTD)', 'Did we keep our promise?', 'Shipments delivered by the promised time ÷ shipments delivered'],
  ['SLA breach', 'Which promises did we break?', 'A delivered shipment that arrived after its promised time'],
  ['Average delay when late', 'How bad is it when we miss?', 'Mean hours past the promised time, late shipments only'],
  ['Cost per shipment', 'What does a shipment cost us?', '(Freight + fuel surcharge + handling) ÷ shipments delivered'],
  ['Cost per kg', 'Are we paying for air?', 'Total cost ÷ total kilograms delivered'],
  ['Shipments on the move', 'What is out there right now?', 'Dispatched but not yet delivered; overdue if past the promised time'],
]

export function About() {
  return (
    <div className="page about">
      <section className="about-intro">
        <h2>What this is</h2>
        <p>
          Chalan (চালান, the word for a consignment) is a control tower for a Bangladeshi freight business. It brings
          road, sea and air shipments into one place so an operations team can see how the network is doing, what it
          costs, and which lanes need attention.
        </p>
        <p>
          It is a portfolio project by Md Sifatullah Sheikh. The same analysis is also built as a PostgreSQL database
          and a Power BI dashboard.
        </p>
      </section>

      <section className="about-note" aria-labelledby="data-h">
        <h2 id="data-h">About the data</h2>
        <p>
          The shipments are synthetic. A seeded generator creates about 23,000 shipments from May 2025 to October
          2026 across real Bangladeshi hubs and fictional carriers. It builds in the patterns that drive delays here:
          the monsoon (June to September), the rush before Eid and the holidays after it, Chattogram port congestion,
          and traffic on the Dhaka–Chattogram highway. No real company data is used.
        </p>
      </section>

      <section aria-labelledby="kpi-h">
        <h2 id="kpi-h">How each number is calculated</h2>
        <table className="defs">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Question it answers</th>
              <th>Formula</th>
            </tr>
          </thead>
          <tbody>
            {KPIS.map(([m, q, f]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{q}</td>
                <td>{f}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">The on-time target is {OTD_TARGET}%. Lanes below 80% are shown in red.</p>
      </section>
    </div>
  )
}
