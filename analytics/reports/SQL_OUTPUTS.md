# SQL outputs

Loaded 23,596 shipments into PostgreSQL schema `chalan`.

## Data checks (all should be 0)

| Check | Rows |
|---|---:|
| late without a reason | 0 |
| in transit but delivered | 0 |
| delivered before dispatch | 0 |
| promised before dispatch | 0 |
| on-time flag disagrees with times | 0 |
| shipments without a lane | 0 |
| cost parts do not add up | 0 |

## v_kpi_monthly

| month_start   |   delivered |   otd_pct |   sla_breaches |   avg_delay_when_late_h |   cost_per_shipment_bdt |   cost_per_kg_bdt |
|:--------------|------------:|----------:|---------------:|------------------------:|------------------------:|------------------:|
| 2025-05-01    |        1180 |      84.8 |            179 |                    16.3 |                   53379 |             10.89 |
| 2025-06-01    |        1113 |      69   |            345 |                    19.8 |                   59491 |             10.58 |
| 2025-07-01    |        1260 |      76.5 |            296 |                    24.2 |                   56361 |             10.02 |
| 2025-08-01    |        1186 |      80.2 |            235 |                    18.6 |                   58645 |             10.78 |
| 2025-09-01    |        1404 |      77.1 |            322 |                    21.6 |                   61086 |             11.14 |
| 2025-10-01    |        1431 |      81   |            272 |                    24.9 |                   60395 |             10.94 |
| 2025-11-01    |        1435 |      81.2 |            270 |                    24.8 |                   57895 |             10.71 |
| 2025-12-01    |        1344 |      83   |            229 |                    27.1 |                   59830 |             10.31 |
| 2026-01-01    |        1239 |      86.5 |            167 |                    19.7 |                   60790 |             11.09 |
| 2026-02-01    |        1134 |      88.2 |            134 |                    23.4 |                   55446 |             10    |
| 2026-03-01    |        1360 |      81.3 |            254 |                    20.1 |                   63337 |             11.67 |
| 2026-04-01    |        1246 |      87.4 |            157 |                    21.7 |                   60040 |             11.22 |
| 2026-05-01    |        1364 |      79.8 |            276 |                    20.2 |                   58838 |             10.38 |
| 2026-06-01    |        1261 |      80.4 |            247 |                    21.7 |                   58374 |             11.24 |
| 2026-07-01    |        1336 |      74.9 |            335 |                    23.9 |                   60169 |             10.51 |
| 2026-08-01    |        1314 |      75.8 |            318 |                    20.3 |                   59966 |             10.78 |
| 2026-09-01    |        1540 |      73.4 |            409 |                    20.9 |                   59939 |             10.86 |
| 2026-10-01    |        1222 |      81   |            232 |                    20.6 |                   59003 |             10.82 |

## v_lane_performance_90d

| lane_id   | origin_id   | destination_id   | mode   |   delivered |   otd_pct |   sla_breaches |   p90_delay_h |   cost_per_shipment_bdt |
|:----------|:------------|:-----------------|:-------|------------:|----------:|---------------:|--------------:|------------------------:|
| CGP-GZP   | CGP         | GZP              | road   |         207 |      65.2 |             72 |          18.3 |                   36801 |
| NGJ-CGP   | NGJ         | CGP              | road   |         341 |      68   |            109 |          22.9 |                   32446 |
| DHK-CGP   | DHK         | CGP              | road   |         267 |      68.2 |             85 |          17.6 |                   33583 |
| GZP-CGP   | GZP         | CGP              | road   |         535 |      70.3 |            159 |          17.4 |                   38850 |
| CGP-DHK   | CGP         | DHK              | road   |         421 |      71.5 |            120 |          14.6 |                   27503 |
| SVR-CGP   | SVR         | CGP              | road   |         375 |      71.7 |            106 |          15.8 |                   38884 |
| CGP-SIN   | CGP         | SIN              | sea    |         230 |      78.3 |             50 |          64.3 |                  115097 |
| DHK-MGL   | DHK         | MGL              | road   |         158 |      79.7 |             32 |          11.9 |                   20327 |

## v_carrier_scorecard_90d

| carrier_id   | carrier_name        | mode   |   delivered |   otd_pct |   avg_delay_when_late_h |   cost_per_kg_bdt |   share_of_mode_pct |   otd_rank_in_mode |
|:-------------|:--------------------|:-------|------------:|----------:|------------------------:|------------------:|--------------------:|-------------------:|
| SKY          | Skyway Cargo        | air    |         136 |      91.2 |                    19.4 |            688.27 |                55.7 |                  1 |
| DAF          | Delta Air Freight   | air    |         108 |      88   |                    16.4 |            599.53 |                44.3 |                  2 |
| PFL          | Padma Freight Lines | road   |         898 |      83.4 |                    16.1 |              7.62 |                26.3 |                  1 |
| MGT          | Meghna Transport    | road   |         806 |      74.4 |                    16.9 |              6.79 |                23.6 |                  2 |
| JMH          | Jamuna Haulage      | road   |         890 |      71.3 |                    15.2 |              6.34 |                26.1 |                  3 |
| KFM          | Karnaphuli Movers   | road   |         815 |      67   |                    14.8 |              5.96 |                23.9 |                  4 |
| BLS          | Bay Link Shipping   | sea    |         298 |      88.3 |                    70.8 |             10.39 |                50.3 |                  1 |
| SSC          | Sundarban Sea Cargo | sea    |         295 |      78.6 |                    67.8 |              8.42 |                49.7 |                  2 |

## v_delay_causes_90d

| mode   | delay_reason            |   late_shipments |   delay_hours |   share_of_mode_pct |
|:-------|:------------------------|-----------------:|--------------:|--------------------:|
| air    | Flight offload          |               15 |           211 |                60   |
| air    | Missing documents       |                6 |           146 |                24   |
| air    | Customs hold            |                4 |            89 |                16   |
| road   | Traffic congestion      |              257 |          4078 |                29.2 |
| road   | Monsoon weather         |              219 |          3448 |                24.9 |
| road   | Port gate queue         |              172 |          2742 |                19.6 |
| road   | Vehicle breakdown       |              141 |          2041 |                16   |
| road   | Late loading at factory |               90 |          1431 |                10.2 |
