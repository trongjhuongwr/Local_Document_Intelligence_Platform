# One-shot local setup (Windows PowerShell). Run from the repository root.
$ErrorActionPreference = "Stop"

Write-Host "[1/6] Starting PostgreSQL (pgvector)..."
docker compose up -d postgres

Write-Host "[2/6] Creating virtual environment..."
if (-not (Test-Path ".venv")) { py -3 -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
.\.venv\Scripts\python.exe -m pip install -e ".[dev]" --quiet

Write-Host "[3/6] Writing .env (if missing)..."
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Write-Host "[4/6] Applying database migrations..."
.\.venv\Scripts\python.exe -m alembic upgrade head

Write-Host "[5/6] Generating the DocFlowBench corpus (seed 42, 30 cases)..."
.\.venv\Scripts\python.exe -m synthetic_data.generator --seed 42 --cases 30

Write-Host "[6/6] Checking Ollama models..."
ollama list | Out-String | ForEach-Object {
    if ($_ -notmatch "llama3.2:1b") { Write-Warning "Run: ollama pull llama3.2:1b" }
    if ($_ -notmatch "all-minilm") { Write-Warning "Run: ollama pull all-minilm" }
}

Write-Host ""
Write-Host "Done. Start the API:  .\.venv\Scripts\python.exe -m uvicorn app.api.main:app --reload"
Write-Host "Start the UI:        .\.venv\Scripts\python.exe -m streamlit run ui/app.py"
