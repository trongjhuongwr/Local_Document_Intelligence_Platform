# One-shot local setup (Windows PowerShell). Run from the repository root.
$ErrorActionPreference = "Stop"

Write-Host "[1/7] Starting PostgreSQL (pgvector)..."
docker compose up -d postgres

Write-Host "[2/7] Ensuring isolated product, test, and eval databases..."
foreach ($database in @("docintel_product", "docintel_test", "docintel_eval")) {
    $exists = docker exec docintel-postgres psql -U docintel -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database'"
    if ($exists -ne "1") {
        docker exec docintel-postgres createdb -U docintel -O docintel $database
    }
    docker exec docintel-postgres psql -U docintel -d $database -c "CREATE EXTENSION IF NOT EXISTS vector;" | Out-Null
}

Write-Host "[3/7] Creating virtual environment..."
if (-not (Test-Path ".venv")) { py -3 -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
.\.venv\Scripts\python.exe -m pip install -e ".[dev]" --quiet

Write-Host "[4/7] Writing .env (if missing)..."
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Write-Host "[5/7] Applying migrations to the three isolated databases..."
$databasePort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }
if (-not $env:POSTGRES_PORT -and (Test-Path ".env")) {
    $portLine = Get-Content ".env" | Where-Object { $_ -match '^POSTGRES_PORT=' } | Select-Object -First 1
    if ($portLine) { $databasePort = ($portLine -split '=', 2)[1].Trim() }
}
$previousDatabaseUrl = $env:DATABASE_URL
foreach ($database in @("docintel_product", "docintel_test", "docintel_eval")) {
    $env:DATABASE_URL = "postgresql+asyncpg://docintel:docintel@localhost:$databasePort/$database"
    .\.venv\Scripts\python.exe -m alembic upgrade head
}
$env:DATABASE_URL = $previousDatabaseUrl

Write-Host "[6/7] Generating the DocFlowBench corpus (seed 42, 30 cases)..."
.\.venv\Scripts\python.exe -m synthetic_data.generator --seed 42 --cases 30

Write-Host "[7/7] Checking Ollama models..."
ollama list | Out-String | ForEach-Object {
    if ($_ -notmatch "llama3.2:1b") { Write-Warning "Run: ollama pull llama3.2:1b" }
    if ($_ -notmatch "all-minilm") { Write-Warning "Run: ollama pull all-minilm" }
}

Write-Host ""
Write-Host "Done. Start the API:  .\.venv\Scripts\python.exe -m uvicorn app.api.main:app --reload"
Write-Host "Start the UI:        npm install; npm run dev   # http://localhost:5173"
