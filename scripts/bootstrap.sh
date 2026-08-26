#!/usr/bin/env bash
# One-shot local setup (Linux/macOS/WSL2). Run from the repository root.
set -euo pipefail

echo "[1/7] Starting PostgreSQL (pgvector)..."
docker compose up -d postgres

echo "[2/7] Ensuring isolated product, test, and eval databases..."
for database in docintel_product docintel_test docintel_eval; do
  if [ "$(docker exec docintel-postgres psql -U docintel -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database'")" != "1" ]; then
    docker exec docintel-postgres createdb -U docintel -O docintel "$database"
  fi
  docker exec docintel-postgres psql -U docintel -d "$database" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
done

echo "[3/7] Creating virtual environment..."
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip --quiet
./.venv/bin/python -m pip install -e ".[dev]" --quiet

echo "[4/7] Writing .env (if missing)..."
[ -f .env ] || cp .env.example .env

echo "[5/7] Applying migrations to the three isolated databases..."
database_port="${POSTGRES_PORT:-}"
if [ -z "$database_port" ] && [ -f .env ]; then
  database_port="$(sed -n 's/^POSTGRES_PORT=//p' .env | head -n 1 | tr -d '[:space:]')"
fi
database_port="${database_port:-5432}"
for database in docintel_product docintel_test docintel_eval; do
  DATABASE_URL="postgresql+asyncpg://docintel:docintel@localhost:$database_port/$database" \
    ./.venv/bin/python -m alembic upgrade head
done

echo "[6/7] Generating the DocFlowBench corpus (seed 42, 30 cases)..."
./.venv/bin/python -m synthetic_data.generator --seed 42 --cases 30

echo "[7/7] Checking Ollama models..."
if ! ollama list | grep -q "llama3.2:1b"; then echo "WARNING: run 'ollama pull llama3.2:1b'"; fi
if ! ollama list | grep -q "all-minilm"; then echo "WARNING: run 'ollama pull all-minilm'"; fi

echo
echo "Done. Start the API:  ./.venv/bin/uvicorn app.api.main:app --reload"
echo "Start the UI:        npm install && npm run dev   # http://localhost:5173"
