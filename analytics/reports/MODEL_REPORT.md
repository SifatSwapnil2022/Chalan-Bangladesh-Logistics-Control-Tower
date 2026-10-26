# Delay-risk model

**Question:** At dispatch, how likely is this shipment to miss its promised delivery time?

**Data:** 15,430 delivered shipments for training (May 2025 to April 2026), 7,939 for testing (May to October 2026).
The split is by time, so the test months play the role of the future. Features use only what is known at dispatch.

**Chosen model:** Logistic regression (higher average precision on the March–April validation months: Logistic regression 0.305, Gradient boosting 0.283).

**Alert threshold:** 0.24. Chosen on the validation months to minimise cost, where a missed delay counts 5× a false alarm.

## Results on the test months

| Model | ROC-AUC | PR-AUC | Precision | Recall | Shipments flagged |
|---|---:|---:|---:|---:|---:|
| Logistic regression | 0.658 | 0.34 | 33% | 59% | 41% |
| Gradient boosting | 0.653 | 0.333 | 34% | 54% | 37% |
| No model (today) | 0.5 | 0.227 | 0% | 0% | 0% |

At this threshold the model flags 41% of shipments and catches 59% of the ones that end up late.
33% of flagged shipments are actually late (the late rate overall is 23%).

## What drives the score (permutation importance, test months)

| Factor | Drop in PR-AUC when shuffled |
|---|---:|
| Carrier | 0.0323 |
| Chattogram port congestion | 0.0265 |
| Distance | 0.0255 |
| Monsoon season | 0.0194 |
| Eid window | 0.0178 |
| Origin hub busier than usual (last 7 days) | 0.0095 |
| Dispatched 4–9 pm (road) | 0.0073 |
| Carrier's on-time rate, last 30 days | 0.0060 |
| Promised transit time | 0.0022 |
| Dispatch hour | 0.0020 |

## Limits

- The data is synthetic, so these numbers show the method, not a real carrier's performance.
- The model does not know about one-off events (strikes, road closures). A live version would add a news or traffic feed.
- Scores are probabilities; check `calibration` in model.json before using them as exact percentages.
