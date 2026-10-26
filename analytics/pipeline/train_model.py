"""Step 3: train the delay-risk model and score open shipments.

    python analytics/pipeline/train_model.py

Question the model answers: at the moment a shipment is dispatched, how likely is it to miss
its promised delivery time? Only information available at dispatch is used, so the score can
be acted on (call the carrier, warn the customer) before the delay happens.

Validation is time-based, like real use:
    train       dispatched before 1 Mar 2026
    validation  Mar–Apr 2026     -> pick the model and the alert threshold
    test        from 1 May 2026  -> reported numbers (never used for any choice)
The final model is refit on everything before 1 May 2026 and scored on the test months.

Writes
    src/data/model.json              read by the web app
    analytics/reports/MODEL_REPORT.md
    chalan.shipment_risk             scores for shipments in transit (if PostgreSQL is reachable)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score, roc_curve
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT.parent
CLEAN = ROOT / "data" / "clean" / "shipments.csv"
REF = ROOT / "data" / "reference"
REPORTS = ROOT / "reports"
DSN = os.environ.get("DATABASE_URL", "postgresql://chalan:chalan@localhost:5432/chalan")
MODEL_VERSION = "2026-10-delay-risk-v1"

EIDS = pd.to_datetime(["2025-06-07", "2026-03-20", "2026-05-27"])
VALID_FROM = pd.Timestamp("2026-03-01", tz="Asia/Dhaka")
TEST_FROM = pd.Timestamp("2026-05-01", tz="Asia/Dhaka")
# What a wrong call costs, in relative terms: a missed delay means an angry customer and a penalty,
# a false alarm means one phone call to the carrier.
COST_MISSED_DELAY = 5
COST_FALSE_ALARM = 1

CATEGORICAL = ["lane_id", "carrier_id", "segment", "vehicle", "mode"]
NUMERIC = [
    "dispatch_hour", "peak_hour", "friday", "monsoon", "eid_window", "port_congestion", "origin_load_7d",
    "carrier_otd_30d", "log_weight", "distance_km", "promised_hours",
]
LABELS = {
    "lane_id": "Lane", "carrier_id": "Carrier", "segment": "Customer segment", "vehicle": "Vehicle", "mode": "Mode",
    "dispatch_hour": "Dispatch hour", "peak_hour": "Dispatched 4–9 pm (road)", "friday": "Dispatched on a Friday",
    "monsoon": "Monsoon season", "eid_window": "Eid window", "port_congestion": "Chattogram port congestion",
    "origin_load_7d": "Origin hub busier than usual (last 7 days)", "carrier_otd_30d": "Carrier's on-time rate, last 30 days",
    "log_weight": "Load weight", "distance_km": "Distance", "promised_hours": "Promised transit time",
}


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    local = df["dispatched_at"].dt.tz_convert("Asia/Dhaka")
    day = local.dt.normalize()
    df["dispatch_day"] = day.dt.tz_localize(None)
    df["dispatch_hour"] = local.dt.hour
    df["peak_hour"] = ((df["mode"] == "road") & local.dt.hour.between(16, 21)).astype(int)
    df["friday"] = (local.dt.dayofweek == 4).astype(int)
    df["monsoon"] = local.dt.month.between(6, 9).astype(int)
    signed = (df["dispatch_day"].values[:, None] - EIDS.values[None, :]) / np.timedelta64(1, "D")
    nearest = signed[np.arange(len(df)), np.abs(signed).argmin(axis=1)]
    df["eid_window"] = ((nearest >= -10) & (nearest <= 4)).astype(int)

    port = pd.read_csv(REF / "port_congestion_daily.csv", parse_dates=["date"]).set_index("date")["port_congestion_index"]
    via_port = (df["origin_id"] == "CGP") | (df["destination_id"] == "CGP")
    df["port_congestion"] = np.where(via_port, df["dispatch_day"].map(port).fillna(port.mean()), 0.0)

    # how busy the origin hub was over the 7 days before dispatch, relative to its average
    daily = df.groupby(["origin_id", "dispatch_day"]).size().rename("n").reset_index()
    full = []
    for hub, g in daily.groupby("origin_id"):
        s = g.set_index("dispatch_day")["n"].asfreq("D", fill_value=0)
        last7 = s.shift(1).rolling(7, min_periods=7).sum() / 7
        full.append(pd.DataFrame({"origin_id": hub, "dispatch_day": s.index, "load": (last7 / s.mean()).values}))
    load = pd.concat(full)
    df = df.merge(load, on=["origin_id", "dispatch_day"], how="left")
    df["origin_load_7d"] = df["load"].fillna(1.0)

    # carrier's on-time rate over deliveries completed in the 30 days before this dispatch (no leakage)
    done = df[df["on_time"].notna()].copy()
    done["delivered_day"] = done["delivered_at"].dt.tz_convert("Asia/Dhaka").dt.normalize().dt.tz_localize(None)
    rates = {}
    for carrier, g in done.groupby("carrier_id"):
        d = g.groupby("delivered_day")["on_time"].agg(["sum", "count"]).asfreq("D", fill_value=0)
        roll = d.rolling(30, min_periods=1).sum()
        rates[carrier] = (roll["sum"] / roll["count"].replace(0, np.nan)).shift(1)
    df["carrier_otd_30d"] = [
        rates[c].get(d, np.nan) if c in rates else np.nan for c, d in zip(df["carrier_id"], df["dispatch_day"])
    ]
    df["carrier_otd_30d"] = df["carrier_otd_30d"].fillna(df.groupby("carrier_id")["carrier_otd_30d"].transform("median")).fillna(0.8)

    df["log_weight"] = np.log1p(df["weight_kg"])
    df["promised_hours"] = (df["promised_at"] - df["dispatched_at"]).dt.total_seconds() / 3600
    return df


def logistic() -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("num", StandardScaler(), NUMERIC),
    ])
    return Pipeline([("pre", pre), ("clf", LogisticRegression(max_iter=2000, C=0.5))])


def boosting() -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), CATEGORICAL),
        ("num", "passthrough", NUMERIC),
    ])
    cat_mask = [True] * len(CATEGORICAL) + [False] * len(NUMERIC)
    clf = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
        l2_regularization=1.0, categorical_features=cat_mask, random_state=7,
    )
    return Pipeline([("pre", pre), ("clf", clf)])


def best_threshold(y: np.ndarray, p: np.ndarray) -> float:
    grid = np.round(np.arange(0.05, 0.9, 0.01), 2)
    costs = [COST_MISSED_DELAY * ((p < t) & (y == 1)).sum() + COST_FALSE_ALARM * ((p >= t) & (y == 0)).sum() for t in grid]
    return float(grid[int(np.argmin(costs))])


def at_threshold(y: np.ndarray, p: np.ndarray, t: float) -> dict:
    tp = int(((p >= t) & (y == 1)).sum())
    fp = int(((p >= t) & (y == 0)).sum())
    fn = int(((p < t) & (y == 1)).sum())
    tn = int(((p < t) & (y == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {"threshold": t, "tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
            "flagged_share": round((tp + fp) / len(y), 3)}


def main() -> None:
    raw = pd.read_csv(CLEAN)
    for c in ("dispatched_at", "promised_at", "delivered_at"):
        raw[c] = pd.to_datetime(raw[c], utc=True)
    df = build_features(raw)
    disp = df["dispatched_at"].dt.tz_convert("Asia/Dhaka")
    scored = df["on_time"].notna()
    df["late"] = (1 - df["on_time"]).astype("float")

    train = df[scored & (disp < VALID_FROM)]
    valid = df[scored & (disp >= VALID_FROM) & (disp < TEST_FROM)]
    test = df[scored & (disp >= TEST_FROM)]
    open_ = df[df["status"] == "In transit"]
    X = CATEGORICAL + NUMERIC

    # model choice and threshold on the validation months
    candidates = {"Logistic regression": logistic, "Gradient boosting": boosting}
    val_scores = {}
    for name, make in candidates.items():
        m = make().fit(train[X], train["late"])
        val_scores[name] = average_precision_score(valid["late"], m.predict_proba(valid[X])[:, 1])
    chosen = max(val_scores, key=val_scores.get)
    m_val = candidates[chosen]().fit(train[X], train["late"])
    threshold = best_threshold(valid["late"].values, m_val.predict_proba(valid[X])[:, 1])

    # refit every model on all data before the test months, then report on the test months only
    fit_on = pd.concat([train, valid])
    y = test["late"].values
    base_rate = float(fit_on["late"].mean())
    results, preds, fitted = {}, {}, {}
    for name, make in candidates.items():
        m = make().fit(fit_on[X], fit_on["late"])
        p = m.predict_proba(test[X])[:, 1]
        fitted[name], preds[name] = m, p
        results[name] = {
            "roc_auc": round(roc_auc_score(y, p), 3),
            "pr_auc": round(average_precision_score(y, p), 3),
            "brier": round(brier_score_loss(y, p), 4),
            **at_threshold(y, p, threshold),
        }
    # baseline: today's practice, no early warning at all
    results["No model (today)"] = {"roc_auc": 0.5, "pr_auc": round(float(y.mean()), 3), "brier": round(brier_score_loss(y, np.full(len(y), base_rate)), 4),
                                   **at_threshold(y, np.zeros(len(y)), threshold)}

    model, p_test = fitted[chosen], preds[chosen]

    # what drives the score: permutation importance on the test months (drop in average precision)
    imp = permutation_importance(model, test[X], y, scoring="average_precision", n_repeats=5, random_state=7)
    importance = sorted(
        [{"feature": LABELS[f], "drop": round(float(imp.importances_mean[i]), 4)} for i, f in enumerate(X)],
        key=lambda r: -r["drop"],
    )

    # direction of effect, in plain terms, from the logistic model's odds ratios (numeric features, per 1 SD)
    lr = fitted["Logistic regression"]
    coefs = lr.named_steps["clf"].coef_[0]
    names = lr.named_steps["pre"].get_feature_names_out()
    influencers = []
    for n, c in zip(names, coefs):
        kind, col = n.split("__", 1)
        if kind == "num":
            influencers.append({"factor": LABELS[col], "odds_ratio": round(float(np.exp(c)), 2), "per": "1 standard deviation"})
        elif col.startswith(("carrier_id_", "lane_id_")):
            label = col.replace("carrier_id_", "Carrier ").replace("lane_id_", "Lane ")
            influencers.append({"factor": label, "odds_ratio": round(float(np.exp(c)), 2), "per": "vs. average"})
    influencers.sort(key=lambda r: -abs(np.log(r["odds_ratio"])))

    fpr, tpr, _ = roc_curve(y, p_test)
    idx = np.linspace(0, len(fpr) - 1, 60).astype(int)
    bins = pd.cut(p_test, np.linspace(0, 1, 11), include_lowest=True)
    calib = pd.DataFrame({"p": p_test, "y": y, "bin": bins}).groupby("bin", observed=True).agg(predicted=("p", "mean"), actual=("y", "mean"), n=("y", "size")).reset_index(drop=True)

    p_open = model.predict_proba(open_[X])[:, 1]

    def band(s: float) -> str:
        return "High" if s >= threshold else ("Medium" if s >= base_rate else "Low")

    out = {
        "version": MODEL_VERSION,
        "question": "At dispatch, how likely is this shipment to miss its promised delivery time?",
        "chosen": chosen,
        "validation_pr_auc": {k: round(v, 3) for k, v in val_scores.items()},
        "threshold": threshold,
        "costs": {"missed_delay": COST_MISSED_DELAY, "false_alarm": COST_FALSE_ALARM},
        "base_rate": round(base_rate, 3),
        "split": {
            "train": {"from": str(fit_on["dispatched_at"].min().date()), "to": "2026-04-30", "rows": int(len(fit_on))},
            "test": {"from": "2026-05-01", "to": str(test["dispatched_at"].max().date()), "rows": int(len(test))},
        },
        "results": results,
        "importance": importance,
        "influencers": influencers[:14],
        "roc": [[round(float(fpr[i]), 3), round(float(tpr[i]), 3)] for i in idx],
        "calibration": calib.round(3).to_dict(orient="records"),
        "test": {"score": [round(float(v), 3) for v in p_test], "late": [int(v) for v in y]},
        "open": {sid: round(float(s), 3) for sid, s in zip(open_["shipment_id"], p_open)},
        "features": [LABELS[f] for f in X],
    }
    (APP / "src" / "data" / "model.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    pd.DataFrame({"shipment_id": open_["shipment_id"], "risk_score": np.round(p_open, 4), "risk_band": [band(s) for s in p_open],
                  "model_version": MODEL_VERSION}).to_csv(ROOT / "data" / "clean" / "shipment_risk.csv", index=False)

    # report
    r = results[chosen]
    rows = "\n".join(
        f"| {k} | {v['roc_auc']} | {v['pr_auc']} | {v['precision']:.0%} | {v['recall']:.0%} | {v['flagged_share']:.0%} |" for k, v in results.items()
    )
    report = f"""# Delay-risk model

**Question:** {out['question']}

**Data:** {len(fit_on):,} delivered shipments for training (May 2025 to April 2026), {len(test):,} for testing (May to October 2026).
The split is by time, so the test months play the role of the future. Features use only what is known at dispatch.

**Chosen model:** {chosen} (higher average precision on the March–April validation months: {', '.join(f'{k} {v:.3f}' for k, v in val_scores.items())}).

**Alert threshold:** {threshold:.2f}. Chosen on the validation months to minimise cost, where a missed delay counts {COST_MISSED_DELAY}× a false alarm.

## Results on the test months

| Model | ROC-AUC | PR-AUC | Precision | Recall | Shipments flagged |
|---|---:|---:|---:|---:|---:|
{rows}

At this threshold the model flags {r['flagged_share']:.0%} of shipments and catches {r['recall']:.0%} of the ones that end up late.
{r['precision']:.0%} of flagged shipments are actually late (the late rate overall is {y.mean():.0%}).

## What drives the score (permutation importance, test months)

| Factor | Drop in PR-AUC when shuffled |
|---|---:|
""" + "\n".join(f"| {i['feature']} | {i['drop']:.4f} |" for i in importance[:10]) + f"""

## Limits

- The data is synthetic, so these numbers show the method, not a real carrier's performance.
- The model does not know about one-off events (strikes, road closures). A live version would add a news or traffic feed.
- Scores are probabilities; check `calibration` in model.json before using them as exact percentages.
"""
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "MODEL_REPORT.md").write_text(report, encoding="utf-8")
    print(report)

    try:
        import psycopg

        with psycopg.connect(DSN, connect_timeout=3) as conn, conn.cursor() as cur:
            cur.execute("TRUNCATE chalan.shipment_risk")
            cur.executemany(
                "INSERT INTO chalan.shipment_risk (shipment_id, risk_score, risk_band, model_version) VALUES (%s, %s, %s, %s)",
                [(sid, float(s), band(s), MODEL_VERSION) for sid, s in zip(open_["shipment_id"], p_open)],
            )
            conn.commit()
            print(f"wrote {len(open_)} scores to chalan.shipment_risk")
    except Exception as e:  # PostgreSQL is optional for this step
        print(f"skipped writing scores to PostgreSQL: {e}")


if __name__ == "__main__":
    main()
