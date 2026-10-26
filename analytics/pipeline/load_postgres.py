"""Step 2: load the clean data into PostgreSQL and build the reporting views.

    export DATABASE_URL=postgresql://user:password@localhost:5432/chalan   # optional
    python analytics/pipeline/load_postgres.py

Creates schema `chalan` (star schema + views), loads every table, runs the data checks
in sql/03_checks.sql and writes a sample of each view to reports/SQL_OUTPUTS.md.
"""

from __future__ import annotations

import io
import os
from pathlib import Path

import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "sql"
REF = ROOT / "data" / "reference"
CLEAN = ROOT / "data" / "clean" / "shipments.csv"
REPORTS = ROOT / "reports"
DSN = os.environ.get("DATABASE_URL", "postgresql://chalan:chalan@localhost:5432/chalan")

# Same dates as src/data/network.ts (EIDS). Approximate: the moon sighting can move them a day.
EIDS = [("2025-06-07", "Eid ul-Adha"), ("2026-03-20", "Eid ul-Fitr"), ("2026-05-27", "Eid ul-Adha")]


def copy_df(cur: psycopg.Cursor, table: str, df: pd.DataFrame) -> None:
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    cols = ", ".join(df.columns)
    with cur.copy(f"COPY chalan.{table} ({cols}) FROM STDIN WITH (FORMAT csv, NULL '\\N')") as cp:
        cp.write(buf.read())


def main() -> None:
    ship = pd.read_csv(CLEAN)
    hubs = pd.read_csv(REF / "hubs.csv")
    carriers = pd.read_csv(REF / "carriers.csv")
    lanes = pd.read_csv(REF / "lanes.csv")
    port = pd.read_csv(REF / "port_congestion_daily.csv")

    for c in ("dispatched_at", "promised_at", "delivered_at"):
        ship[c] = pd.to_datetime(ship[c], utc=True)
    ship["dispatch_date"] = pd.to_datetime(ship["dispatch_date"]).dt.date
    ship["delivered_date"] = pd.to_datetime(ship["delivered_date"]).dt.date

    with psycopg.connect(DSN, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute((SQL / "01_schema.sql").read_text())

        copy_df(cur, "dim_hub", hubs.rename(columns={"latitude": "latitude", "longitude": "longitude"}).assign(
            is_international=hubs["is_international"].astype(bool)))
        copy_df(cur, "dim_carrier", carriers)
        copy_df(cur, "dim_customer", ship[["customer_id", "segment"]].drop_duplicates())
        copy_df(cur, "dim_lane", lanes.assign(
            lane_id=lanes["origin_id"] + "-" + lanes["destination_id"],
            via_chattogram=(lanes["origin_id"] == "CGP") | (lanes["destination_id"] == "CGP"),
        )[["lane_id", "origin_id", "destination_id", "mode", "via_chattogram"]])
        copy_df(cur, "ref_holiday", pd.DataFrame(EIDS, columns=["holiday_date", "name"]))
        copy_df(cur, "ref_port_congestion", port.rename(columns={"date": "day", "port_congestion_index": "index"}))

        # calendar from the first dispatch to the last delivery
        first = min(ship["dispatch_date"].min(), ship["delivered_date"].dropna().min())
        last = max(ship["dispatch_date"].max(), ship["delivered_date"].dropna().max())
        cur.execute(
            """
            INSERT INTO chalan.dim_date
            SELECT d::date, extract(year FROM d), extract(month FROM d), date_trunc('month', d)::date,
                   extract(week FROM d), trim(to_char(d, 'Day')), extract(dow FROM d) = 5,
                   extract(month FROM d) BETWEEN 6 AND 9,
                   EXISTS (SELECT 1 FROM chalan.ref_holiday h WHERE d::date BETWEEN h.holiday_date - 10 AND h.holiday_date + 4)
            FROM generate_series(%s::date, %s::date, interval '1 day') d
            """,
            (first, last),
        )

        fact = ship[
            ["shipment_id", "lane_id", "carrier_id", "customer_id", "dispatch_date", "delivered_date", "vehicle", "weight_kg",
             "distance_km", "cargo_value_bdt", "dispatched_at", "promised_at", "delivered_at", "status", "delivery_time_missing",
             "on_time", "delay_hours", "delay_reason", "freight_bdt", "fuel_surcharge_bdt", "handling_bdt", "total_cost_bdt"]
        ].copy()
        fact["on_time"] = fact["on_time"].astype("Int64")
        copy_df(cur, "fact_shipment", fact)

        cur.execute((SQL / "02_views.sql").read_text())
        conn.commit()

        cur.execute("SET search_path = chalan")
        checks_sql = "\n".join(l for l in (SQL / "03_checks.sql").read_text().splitlines() if not l.startswith("SET "))
        cur.execute(checks_sql)
        checks = cur.fetchall()
        failed = [c for c in checks if c[1] != 0]

        out = ["# SQL outputs", "", f"Loaded {len(fact):,} shipments into PostgreSQL schema `chalan`.", "", "## Data checks (all should be 0)", "",
               "| Check | Rows |", "|---|---:|", *[f"| {c} | {n} |" for c, n in checks], ""]
        for view, limit in (("v_kpi_monthly", 18), ("v_lane_performance_90d", 8), ("v_carrier_scorecard_90d", 8), ("v_delay_causes_90d", 8)):
            cur.execute(f"SELECT * FROM chalan.{view} LIMIT {limit}")
            df = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
            out += [f"## {view}", "", df.to_markdown(index=False), ""]
        REPORTS.mkdir(exist_ok=True)
        (REPORTS / "SQL_OUTPUTS.md").write_text("\n".join(out), encoding="utf-8")
        print("\n".join(out[:14 + len(checks)]))
        import json

        path = ROOT.parent / "src" / "data" / "pipeline.json"
        current = json.loads(path.read_text()) if path.exists() else {}
        current["postgres"] = {"rows": len(fact), "checks": [{"check": c, "rows": n} for c, n in checks],
                               "tables": ["fact_shipment", "dim_lane", "dim_hub", "dim_carrier", "dim_customer", "dim_date",
                                          "ref_holiday", "ref_port_congestion", "shipment_risk"],
                               "views": ["v_kpi_monthly", "v_lane_performance_90d", "v_carrier_scorecard_90d",
                                         "v_delay_causes_90d", "v_open_exceptions"]}
        path.write_text(json.dumps(current, indent=1), encoding="utf-8")
        if failed:
            raise SystemExit(f"Data checks failed: {failed}")


if __name__ == "__main__":
    main()
