# Data quality report

Source: `data/raw/shipments_raw.csv`, 23,770 rows. Output: `data/clean/shipments.csv`, 23,596 shipments.

| Issue | What was done | Rows |
|---|---|---:|
| Duplicate rows | Removed exact copies of a row | 174 |
| Hub names | Mapped spelling variants (e.g. 'CTG Port', 'Narayangonj') to one hub code | 1,463 |
| Date format | Converted DD/MM/YYYY HH:MM rows to ISO time | 549 |
| Missing delivery time | Kept, but excluded from on-time and delay measures | 88 |
| Weight unit | Road loads under 50 kg multiplied by 1,000 (entered in tonnes) | 68 |
| Negative freight | Sign flipped; amounts match the lane's normal range | 56 |

After cleaning: 23,369 delivered shipments can be scored on time; 139 are still in transit.

Checks that pass after cleaning: unique shipment IDs, every hub and carrier mapped, promised time after dispatch,
positive freight, no on-time shipment carrying a delay reason.
