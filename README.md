# Chalan (চালান): a freight control tower for Bangladesh

**Live site:** https://sifatswapnil2022.github.io/chalan-bangladesh-logistics-control-tower/

A case study in logistics analytics. A fictional third-party logistics company, Northgate Distribution, misses its on-time promise on roughly one delivery in four. This project takes its shipment data from a messy export to a cleaned warehouse, a delay-risk model and a dashboard, and ends with three changes the planning team could make and what each would cost.

*Chalan* is the word Bangladeshi trading and freight teams use for a consignment.

> **The data is simulated.** Hubs, distances, seasons and holidays are real; the carriers, customers and volumes are invented. The point is the method, not the figures.

![Overview page](docs/overview.png)

## The problem

Logistics costs Bangladesh an estimated 15 to 20% of GDP, against 8 to 10% in most economies ([DCCI, via TBS, June 2025](https://www.tbsnews.net/node/1176496)). In the World Bank's 2023 Logistics Performance Index the country ranked 88th of 139 and 105th for tracking and tracing ([The Daily Star](https://www.thedailystar.net/business/economy/news/bangladesh-12-notches-wb-logistics-index-3305406)). Chattogram port handles over 80% of trade and import dwell time rose to 8.3 days in 2024 ([Maritime Gateway](https://www.maritimegateway.com/chattogram-port-dwell-time/)); in July 2025 up to 700 trucks a day reached the Sitakunda depots, built for about 400 ([Apparel Resources](https://apparelresources.com/business-news/trade/cargo-congestion-dhaka-chattogram-highway-intensifies-us-tariff-deadline-sparks-surge/)).

For a shipper, that turns into late deliveries nobody saw coming.

## What the data shows (last 90 days)

| | |
|---|---|
| On-time delivery | **76.3%** against a 90% target (1,014 late out of 4,283) |
| Lanes through Chattogram | 65% of deliveries, **75% of late ones** |
| Same road, different carrier | Savar → Chattogram: Padma Freight Lines 84% on time, Karnaphuli Movers 58% |
| Around Eid | road on-time falls to 69%, from 80% |

## What I would change

Estimated per 90 days from the network's own data (Scenario page, and `analytics/reports/FINDINGS_FOR_MANAGEMENT.md`):

| Change | Late deliveries avoided | Extra cost |
|---|---:|---:|
| Move 30% of the weakest carrier's loads on each road lane to the best carrier on that lane | 47 | ৳11.8 lakh |
| Move 40% of 4–9 pm truck dispatches earlier in the day | 14 | none |
| Pre-book Eid trucks two weeks ahead (8% premium) | 13 | ৳2.7 lakh |
| Start each morning from the model's call list | catches 59% of delays by flagging 41% of loads | staff time |

On-time delivery goes from 76.3% to about 78%. That is not 90%. Most of what remains is port and highway congestion, which needs the port and the carriers, not one shipper. The data's job there is to put a number on it for carrier contracts and depot negotiations.

## The site

| Page | What it is for | BI feature it mirrors |
|---|---|---|
| Brief | The case in one page: problem, findings, recommendations, limits | |
| Overview | KPIs with trend and change, lane map, delay reasons | Cross-filtering (click a lane or segment) |
| Exceptions | Today's open shipments, overdue first, then by model risk, with a suggested next step | Tick-off list, CSV export |
| Lanes and carriers | Origin–destination matrix, carrier scorecard, cost vs reliability | Matrix visual, conditional formatting, data bars |
| Lane details | Everything about one lane | Drill-through |
| Root cause | Split late shipments by any field, in any order; raw and model-adjusted drivers | Decomposition tree, key influencers |
| Delay risk | Threshold slider with live confusion matrix, ROC, calibration, cost curve | |
| Scenario planner | Three levers and a cost assumption, with a breach bridge chart | What-if parameters, waterfall |
| Method | Pipeline, data-quality results, SQL checks, definitions, limits | |

Every page, filter and scenario setting lives in the URL, so a view can be bookmarked or sent to someone (the equivalent of a Power BI bookmark).

| Root cause | Scenario planner |
|---|---|
| ![Root cause](docs/root-cause.png) | ![Scenario](docs/scenario.png) |

## How it is built

```
scripts/export-raw.ts      seeded simulation -> analytics/data/raw/shipments_raw.csv (23,770 rows, deliberately messy)
analytics/pipeline/
  clean.py                 dedupe, hub-name mapping, date and unit fixes -> data/clean + DATA_QUALITY_REPORT.md
  load_postgres.py         star schema in PostgreSQL 16, KPI views, 7 integrity checks -> SQL_OUTPUTS.md
  train_model.py           delay-risk model -> src/data/model.json + MODEL_REPORT.md
  findings.py              scenario arithmetic -> FINDINGS_FOR_MANAGEMENT.md
analytics/sql/             schema, views, checks
analytics/powerbi/         theme, DAX measures, page-by-page build guide
src/                       React 19 + TypeScript + Vite, charts drawn in SVG (d3-geo for the map only)
```

**Data cleaning.** Six defects are planted in the export and each fix is counted: 174 duplicates, 1,463 hub-name variants ("CTG Port", "Narayangonj"), 549 day-first dates, 88 missing delivery times, 68 weights entered in tonnes, 56 negative freight amounts.

**Warehouse.** `fact_shipment` with dimensions for hub, carrier, customer, lane and date, plus reference tables for port congestion and holidays. Views compute monthly KPIs, 90-day lane and carrier scorecards (with P90 delay and rank within mode), delay causes and open exceptions. Seven check queries must each return zero rows.

**Model.** The question is: *at dispatch, how likely is this shipment to miss its promised time?* Only fields known at dispatch are used; the carrier's recent on-time rate is computed from deliveries completed before each dispatch, so nothing leaks from the future. Split by time: train on the first 10 months, choose model and threshold on the next 2, report once on the last 6. Logistic regression (ROC-AUC 0.66, PR-AUC 0.34 against a 0.23 base rate) beat gradient boosting on validation and is easier to explain. The alert threshold minimises cost with a missed delay weighted five times a false alarm. It is a modest model, and the site says so.

**Power BI.** `analytics/powerbi/` has a theme file, the DAX for every measure on the site (including the what-if "breaches avoided" measure) and a build guide, so the same report can be rebuilt on the PostgreSQL views.

## Run it

```bash
npm install
npm run dev                      # http://localhost:5173

# optional: rebuild the data, warehouse and model
pip install -r analytics/requirements.txt
export DATABASE_URL=postgresql://chalan:chalan@localhost:5432/chalan   # skipped if unreachable
./scripts/run-pipeline.sh
```

`npm run build` type-checks and writes `dist/`. Deployed to GitHub Pages by `.github/workflows/pages.yml`; `vercel.json` covers Vercel.

## Limits

- Simulated data: the generator decides what causes delay, and the model then finds it. This shows the pipeline works end to end, not that these are the causes in real freight.
- Penalties and lost customers are not in the data, so only the cost side of each recommendation is priced.
- Eid dates are fixed to the expected day; the real date can move by one.

---

Md Sifatullah Sheikh · [GitHub](https://github.com/SifatSwapnil2022)
