"""Step 1: clean the raw shipment export.

    python analytics/pipeline/clean.py

Reads   analytics/data/raw/shipments_raw.csv (what a TMS / carrier spreadsheet export looks like)
Writes  analytics/data/clean/shipments.csv
        analytics/reports/DATA_QUALITY_REPORT.md

Every rule below fixes a problem found in the raw file. Each fix is counted, so the report
says exactly what changed and nothing is cleaned silently.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "shipments_raw.csv"
REF = ROOT / "data" / "reference"
CLEAN = ROOT / "data" / "clean"
REPORTS = ROOT / "reports"

# Names people actually type for the same hub. Kept as data so operations can extend it.
HUB_ALIASES = {
    "chittagong port": "CGP",
    "ctg port": "CGP",
    "chattogram": "CGP",
    "dhaka(tejgaon)": "DHK",
    "dhaka": "DHK",
    "tejgaon": "DHK",
    "narayangonj": "NGJ",
    "n.ganj": "NGJ",
}

DHAKA_TZ = timezone.utc  # timestamps are stored in UTC after parsing


def parse_ts(value: str | float) -> pd.Timestamp | None:
    """Accepts ISO 8601 with offset, or DD/MM/YYYY HH:MM in Dhaka time (+06:00)."""
    if not isinstance(value, str) or not value.strip():
        return None
    v = value.strip()
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2})", v)
    if m:
        d, mo, y, h, mi = map(int, m.groups())
        return pd.Timestamp(datetime(y, mo, d, h, mi), tz="Asia/Dhaka").tz_convert("UTC")
    return pd.Timestamp(v).tz_convert("UTC")


def update_app_summary(data: dict, key: str) -> None:
    """Keeps src/data/pipeline.json in step with the latest run, for the web app's Method page."""
    import json

    path = ROOT.parent / "src" / "data" / "pipeline.json"
    current = json.loads(path.read_text()) if path.exists() else {}
    current[key] = data
    path.write_text(json.dumps(current, indent=1), encoding="utf-8")


def main() -> None:
    CLEAN.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(RAW, dtype=str, keep_default_na=False)
    hubs = pd.read_csv(REF / "hubs.csv")
    carriers = pd.read_csv(REF / "carriers.csv")
    log: list[tuple[str, str, int]] = []

    n_raw = len(raw)

    # 1. exact duplicate rows (the same shipment uploaded twice)
    dupes = raw.duplicated()
    log.append(("Duplicate rows", "Removed exact copies of a row", int(dupes.sum())))
    df = raw[~dupes].copy()
    assert df["shipment_id"].is_unique, "shipment_id repeats with different content; needs a manual look"

    # 2. hub names: trim, lower-case, then map official names and known aliases to hub codes
    name_to_id = {n.lower(): i for n, i in zip(hubs["hub_name"], hubs["hub_id"])}
    name_to_id.update({n.lower(): i for n, i in zip(hubs["short_name"], hubs["hub_id"])})
    name_to_id.update(HUB_ALIASES)
    fixed_names = 0
    for col, out in (("origin", "origin_id"), ("destination", "destination_id")):
        key = df[col].str.strip().str.lower()
        official = df[col].isin(hubs["hub_name"])
        fixed_names += int((~official).sum())
        df[out] = key.map(name_to_id)
        unknown = df[out].isna()
        assert not unknown.any(), f"Unmapped {col} names: {sorted(df.loc[unknown, col].unique())[:10]}"
    log.append(("Hub names", "Mapped spelling variants (e.g. 'CTG Port', 'Narayangonj') to one hub code", fixed_names))

    # 3. timestamps: two formats in the file, convert all to UTC
    dmy = df["dispatched_at"].str.match(r"^\d{2}/\d{2}/\d{4}")
    log.append(("Date format", "Converted DD/MM/YYYY HH:MM rows to ISO time", int(dmy.sum())))
    for col in ("dispatched_at", "promised_at", "delivered_at"):
        df[col] = df[col].map(parse_ts)

    # 4. delivered, but no delivery time recorded: keep the row, but it cannot be scored on time
    missing = (df["status"] == "Delivered") & df["delivered_at"].isna()
    log.append(("Missing delivery time", "Kept, but excluded from on-time and delay measures", int(missing.sum())))
    df["delivery_time_missing"] = missing

    # 5. weight typed in tonnes instead of kg (a 7 t truck load entered as 7)
    df["weight_kg"] = df["weight_kg"].astype(float)
    tonnes = (df["mode"] == "ROAD") & (df["weight_kg"] < 50)
    df.loc[tonnes, "weight_kg"] = df.loc[tonnes, "weight_kg"] * 1000
    log.append(("Weight unit", "Road loads under 50 kg multiplied by 1,000 (entered in tonnes)", int(tonnes.sum())))

    # 6. negative freight: sign error on entry
    for c in ("freight_bdt", "fuel_surcharge_bdt", "handling_bdt", "cargo_value_bdt", "distance_km"):
        df[c] = df[c].astype(float)
    neg = df["freight_bdt"] < 0
    df.loc[neg, "freight_bdt"] = df.loc[neg, "freight_bdt"].abs()
    log.append(("Negative freight", "Sign flipped; amounts match the lane's normal range", int(neg.sum())))

    # derived fields
    df["mode"] = df["mode"].str.lower()
    df["carrier_id"] = df["carrier_name"].map(dict(zip(carriers["carrier_name"], carriers["carrier_id"])))
    assert df["carrier_id"].notna().all(), "unknown carrier name"
    df["lane_id"] = df["origin_id"] + "-" + df["destination_id"]
    df["customer_id"] = df["customer"]
    done = df["delivered_at"].notna()
    df["on_time"] = np.where(done, (df["delivered_at"] <= df["promised_at"]).astype(int), np.nan)
    df["delay_hours"] = np.where(
        done, ((df["delivered_at"] - df["promised_at"]).dt.total_seconds() / 3600).clip(lower=0).round(1), np.nan
    )
    df["dispatch_date"] = df["dispatched_at"].map(lambda t: t.tz_convert("Asia/Dhaka").date().isoformat())
    df["delivered_date"] = df["delivered_at"].map(lambda t: t.tz_convert("Asia/Dhaka").date().isoformat() if t is not None and not pd.isna(t) else "")
    df["total_cost_bdt"] = df["freight_bdt"] + df["fuel_surcharge_bdt"] + df["handling_bdt"]
    df["delay_reason"] = df["delay_reason"].replace("", np.nan)

    # sanity checks that should never fail after cleaning
    assert (df["promised_at"] > df["dispatched_at"]).all()
    assert (df["freight_bdt"] > 0).all() and (df["weight_kg"] >= 50).all()
    assert df.loc[df["on_time"] == 1, "delay_reason"].isna().all(), "on-time shipment with a delay reason"

    cols = [
        "shipment_id", "origin_id", "destination_id", "lane_id", "mode", "carrier_id", "customer_id", "segment", "vehicle",
        "weight_kg", "distance_km", "cargo_value_bdt", "dispatched_at", "promised_at", "delivered_at", "dispatch_date",
        "delivered_date", "status",
        "delivery_time_missing", "on_time", "delay_hours", "delay_reason", "freight_bdt", "fuel_surcharge_bdt",
        "handling_bdt", "total_cost_bdt",
    ]
    out = df[cols].sort_values("dispatched_at")
    for c in ("dispatched_at", "promised_at", "delivered_at"):
        out[c] = out[c].map(lambda t: t.isoformat() if t is not None and not pd.isna(t) else "")
    out.to_csv(CLEAN / "shipments.csv", index=False)

    scored = out["on_time"].notna()
    lines = [
        "# Data quality report",
        "",
        f"Source: `data/raw/shipments_raw.csv`, {n_raw:,} rows. Output: `data/clean/shipments.csv`, {len(out):,} shipments.",
        "",
        "| Issue | What was done | Rows |",
        "|---|---|---:|",
        *[f"| {a} | {b} | {c:,} |" for a, b, c in log],
        "",
        f"After cleaning: {int(scored.sum()):,} delivered shipments can be scored on time; "
        f"{int((out['status'] == 'In transit').sum()):,} are still in transit.",
        "",
        "Checks that pass after cleaning: unique shipment IDs, every hub and carrier mapped, promised time after dispatch,",
        "positive freight, no on-time shipment carrying a delay reason.",
    ]
    (REPORTS / "DATA_QUALITY_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    update_app_summary({
        "raw_rows": n_raw,
        "clean_rows": len(out),
        "scored_rows": int(scored.sum()),
        "in_transit": int((out["status"] == "In transit").sum()),
        "issues": [{"issue": a, "action": b, "rows": c} for a, b, c in log],
    }, "cleaning")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
