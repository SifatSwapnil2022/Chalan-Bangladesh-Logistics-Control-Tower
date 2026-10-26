# Analytics pipeline

Everything behind the numbers on the site. Run from the repository root.

```bash
pip install -r analytics/requirements.txt
./scripts/run-pipeline.sh
```

| Step | Script | Output |
|---|---|---|
| 1. Raw export | `scripts/export-raw.ts` | `data/raw/shipments_raw.csv`, `data/reference/*.csv` |
| 2. Clean | `pipeline/clean.py` | `data/clean/shipments.csv`, `reports/DATA_QUALITY_REPORT.md` |
| 3. Warehouse | `pipeline/load_postgres.py` + `sql/*.sql` | schema `chalan` in PostgreSQL, `reports/SQL_OUTPUTS.md` |
| 4. Model | `pipeline/train_model.py` | `src/data/model.json`, `reports/MODEL_REPORT.md`, `data/clean/shipment_risk.csv` |
| 5. Findings | `pipeline/findings.py` | `reports/FINDINGS_FOR_MANAGEMENT.md` |

Steps 2, 3 and 4 also update `src/data/pipeline.json`, which the Method page reads.

## PostgreSQL

Step 3 needs a database. Locally:

```bash
createuser chalan --pwprompt          # password: chalan
createdb chalan --owner chalan
export DATABASE_URL=postgresql://chalan:chalan@localhost:5432/chalan
```

If the database is not reachable the runner skips step 3; the model trains from the CSV either way.

## Power BI

`powerbi/BUILD_GUIDE.md` walks through connecting to the views (or the clean CSVs), the relationships, the pages and bookmarks. `powerbi/DAX_MEASURES.md` holds the measures; `powerbi/chalan-theme.json` the colours.
