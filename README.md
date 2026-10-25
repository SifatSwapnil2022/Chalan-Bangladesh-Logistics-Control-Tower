# Chalan (চালান): Bangladesh Logistics Control Tower

**Live:** https://sifatswapnil2022.github.io/Chalan-Bangladesh-Logistics-Control-Tower/

One place where an operations team can see every shipment across Bangladesh's road, sea and air lanes:
how the network is performing, what it costs, and which lanes need attention.

*Chalan* (চালান) is the word Bangladeshi freight and trading teams use for a consignment.

> Work in progress. Built step by step; this README grows with each stage.

## What is live now

- **Overview:** on-time delivery, SLA breaches, average delay, cost per shipment and shipments on the move,
  each compared with the previous period.
- **Network map:** every freight lane drawn on a map of Bangladesh, coloured by on-time performance and sized by volume.
- **Monthly trend** with the monsoon and Eid marked, since they explain most dips.
- **Why shipments were late:** delay causes ranked by count.
- Filters for period, mode (road, sea, air) and customer segment.

## Coming next

- Network and hubs page, routes and carriers scorecard
- Delay-risk model (scikit-learn) and exception alerts
- PostgreSQL schema, SQL views and a Power BI version of the dashboard
- Findings for management

## Data

All shipments are **synthetic**. A seeded generator (`src/data/generate.ts`) creates about 23,000 shipments
from May 2025 to October 2026 across real Bangladeshi hubs and fictional carriers, with the patterns that drive
delays here: the monsoon, the rush before Eid and the holidays after it, Chattogram port congestion and
traffic on the Dhaka–Chattogram highway. No real company data is used.

## Run locally

```bash
npm install
npm run dev
```

## Stack

React, TypeScript, Vite, d3-geo (map projection), hand-built SVG charts. Map outline from Natural Earth.

---

© 2026 Md Sifatullah Sheikh. All rights reserved.
