#!/usr/bin/env bash
# Rebuild everything from the seed: raw export -> clean -> warehouse -> model -> findings.
# PostgreSQL is optional; without it the load step is skipped and the model still trains from CSV.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/5 raw export";        npx tsx scripts/export-raw.ts
echo "2/5 clean";             python3 analytics/pipeline/clean.py
echo "3/5 load PostgreSQL"
if python3 -c "import os, psycopg; psycopg.connect(os.environ.get('DATABASE_URL', 'postgresql://chalan:chalan@localhost:5432/chalan'), connect_timeout=3).close()" 2>/dev/null; then
  python3 analytics/pipeline/load_postgres.py
else
  echo "    no database at \$DATABASE_URL, skipping (see analytics/README.md)"
fi
echo "4/5 train model";       python3 analytics/pipeline/train_model.py
echo "5/5 findings";          python3 analytics/pipeline/findings.py
echo "done. Rebuild the site with: npm run build"
