#!/usr/bin/env bash
# One-shot local setup (Linux/macOS/WSL2). Run from the repository root.
set -euo pipefail

echo "[1/6] Starting PostgreSQL (pgvector)..."
docker compose up -d postgres

echo "[2/6] Creating virtual environment..."
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip --quiet
./.venv/bin/python -m pip install -e ".[dev]" --quiet

echo "[3/6] Writing .env (if missing)..."
[ -f .env ] || cp .env.example .env

echo "[4/6] Applying database migrations..."
./.venv/bin/python -m alembic upgrade head

echo "[5/6] Generating the DocFlowBench corpus (seed 42, 30 cases)..."
./.venv/bin/python -m synthetic_data.generator --seed 42 --cases 30

echo "[6/6] Checking Ollama models..."
if ! ollama list | grep -q "llama3.2:1b"; then echo "WARNING: run 'ollama pull llama3.2:1b'"; fi
if ! ollama list | grep -q "all-minilm"; then echo "WARNING: run 'ollama pull all-minilm'"; fi

echo
echo "Done. Start the API:  ./.venv/bin/uvicorn app.api.main:app --reload"
echo "Start the UI:        ./.venv/bin/streamlit run ui/app.py"
