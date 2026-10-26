# Building the Power BI report

The web app and the Power BI report show the same numbers from the same data. This guide builds
the `.pbix` in about two hours in Power BI Desktop.

## 1. Get the data

Option A, PostgreSQL (after running `analytics/pipeline/load_postgres.py`):
Home → Get data → PostgreSQL database → server `localhost`, database `chalan` → import the tables
in schema `chalan`: `fact_shipment`, `dim_lane`, `dim_hub`, `dim_carrier`, `dim_customer`, `dim_date`,
`shipment_risk`.

Option B, CSV only: import `data/clean/shipments.csv` (name it `fact_shipment`), `data/clean/shipment_risk.csv` and the files in
`data/reference/`. Build `dim_date` with:

```dax
dim_date =
ADDCOLUMNS (
    SELECTCOLUMNS ( CALENDAR ( DATE ( 2025, 5, 1 ), DATE ( 2026, 11, 30 ) ), "date_key", [Date] ),
    "month_start", STARTOFMONTH ( [date_key] ),
    "Month Label", FORMAT ( [date_key], "MMM yy" ),
    "is_monsoon", MONTH ( [date_key] ) IN { 6, 7, 8, 9 },
    "is_friday", WEEKDAY ( [date_key], 2 ) = 5
)
```

## 2. Model

| From | To | Cardinality | Active |
|---|---|---|---|
| `fact_shipment[delivered_date]` | `dim_date[date_key]` | many to one | yes |
| `fact_shipment[dispatch_date]` | `dim_date[date_key]` | many to one | no (use `USERELATIONSHIP`) |
| `fact_shipment[lane_id]` | `dim_lane[lane_id]` | many to one | yes |
| `fact_shipment[carrier_id]` | `dim_carrier[carrier_id]` | many to one | yes |
| `fact_shipment[customer_id]` | `dim_customer[customer_id]` | many to one | yes |
| `dim_lane[origin_id]` | `dim_hub[hub_id]` | many to one | yes |
| `fact_shipment[shipment_id]` | `shipment_risk[shipment_id]` | one to one, both directions | yes |

Add the measures from `DAX_MEASURES.md`. Apply the theme: View → Themes → Browse → `chalan-theme.json`.

## 3. Pages

| Page | Visuals | Power BI features used |
|---|---|---|
| Overview | KPI cards (OTD %, SLA breaches, avg delay, cost per shipment, open shipments), Azure/Shape map of lanes, OTD by month line with target line, delay causes bar | Slicers (date, mode, segment) synced across pages, conditional formatting with `OTD Status Colour`, report-page tooltip on the lane visual |
| Lanes & carriers | Matrix origin × destination with background colour by OTD %, carrier table with data bars, scatter cost per kg vs OTD % sized by deliveries | Cross-filtering between visuals, `RANKX` measure, field parameters to swap the matrix metric |
| Root cause | Decomposition tree on SLA Breaches (Mode → Lane → Carrier → Delay reason), Key influencers on `on_time` | AI visuals |
| Delay risk | Model metrics as cards, risk band distribution, table of scored open shipments | Import `shipment_risk`; conditional icons on risk band |
| Exceptions | Table of open shipments, overdue first, risk score with data bars | Drill-through to Lane detail; export data |
| Scenario | What-if slider **Volume Shift**, Projected OTD % vs OTD % card pair, breaches avoided by lane | What-if parameter |
| Lane detail (hidden) | Lane KPIs, monthly trend, carriers on the lane, causes | Drill-through on `dim_lane[lane_id]` with a back button |

Bookmarks: save "Chattogram corridor, last 90 days" and "Monsoon months" as bookmarks and add a
bookmark navigator on the Overview page.

## 4. Share

Export to PDF for applications (File → Export → PDF), or publish to a workspace. Keep screenshots of
each page in `analytics/powerbi/screenshots/` so the repo shows the report without Power BI installed.
