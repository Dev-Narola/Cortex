<#
Bring up Cortex V4 locally (dev-only).

What this does:
1. Starts the docker compose infra (db, redis, minio) on host ports
   5433/6380/9000 (NOT 5432/6379 — those are taken by a Windows
   Postgres + Redis service on this machine).
2. Runs `alembic upgrade head` to provision the V4 schema.
3. Runs `pytest -q` (default suite, V4-baseline coverage).
4. Boots `uvicorn` on port 8000 in a new PowerShell window so the
   smoke test can drive it.

Usage::

    cd D:\Projects\Cortex\Cortex
    .\scripts\dev_up.ps1
#>

$ErrorActionPreference = "Stop"
$repo = "D:\Projects\Cortex\Cortex"
Set-Location $repo

Write-Host "==> docker compose up (db, redis, minio)" -ForegroundColor Cyan
Push-Location docker
docker compose up -d db redis minio | Out-Host
Pop-Location
Start-Sleep -Seconds 6

Write-Host "`n==> alembic upgrade head" -ForegroundColor Cyan
    $ErrorActionPreference = 'Continue'
alembic upgrade head 2>&1 | ForEach-Object { $_.ToString() } | Out-Host
    $ErrorActionPreference = 'Stop' # Optional: revert back to default if the rest of your script needs it

Write-Host "`n==> pytest (default suite, excludes live_infra)" -ForegroundColor Cyan
python -m pytest -q 2>&1 | Select-Object -Last 5 | Out-Host

Write-Host "`n==> starting uvicorn on http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "    (a new window will open; close it with Ctrl+C to stop)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$repo'; uvicorn src.main:app --host 127.0.0.1 --port 8000"
)
Start-Sleep -Seconds 8

Write-Host "`n==> smoke check" -ForegroundColor Cyan
& curl.exe -s -w "GET /health      -> %{http_code}`n" http://localhost:8000/health
& curl.exe -s -w "GET /health/ready -> %{http_code}`n" http://localhost:8000/health/ready
& curl.exe -s -w "GET /metrics     -> %{http_code}`n" http://localhost:8000/metrics

Write-Host "`nAll three endpoints green? Run the full V4 smoke test:" -ForegroundColor Green
Write-Host "    python scripts/smoke_test_observability.py" -ForegroundColor Green
Write-Host "Or the V3 RAG smoke test:" -ForegroundColor Green
Write-Host "    python scripts/smoke_test_rag.py" -ForegroundColor Green
