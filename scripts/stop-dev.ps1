$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidRoot = Join-Path $projectRoot '.runtime\pids'

foreach ($name in @('admin', 'client', 'backend', 'provider')) {
    $pidFile = Join-Path $pidRoot "$name.pid"
    if (-not (Test-Path $pidFile)) { continue }
    $processId = [int](Get-Content $pidFile -Raw)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $processId
        Write-Host "Stopped $name (PID $processId)."
    }
    Remove-Item -LiteralPath $pidFile -Force
}

docker compose -f (Join-Path $projectRoot 'compose.dev.yml') --profile media down
Write-Host 'Development services stopped. Data remains under .runtime.'
