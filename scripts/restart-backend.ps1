param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.runtime\pids\backend.pid'
if (Test-Path -LiteralPath $pidFile) {
    $backendPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$backendPid" -ErrorAction SilentlyContinue
    if ($details -and $details.CommandLine -like "*$projectRoot*vibe-music-server*") {
        Stop-Process -Id $backendPid
        Wait-Process -Id $backendPid -Timeout 20 -ErrorAction SilentlyContinue
    } elseif ($details) {
        throw "PID $backendPid belongs to another application. Refusing to stop it."
    }
    Remove-Item -LiteralPath $pidFile
}
if (-not $SkipBuild) {
    Push-Location (Join-Path $projectRoot 'vibe-music-backend')
    try {
        & .\mvnw.cmd "-Dmaven.repo.local=$projectRoot\.runtime\m2" package
        if ($LASTEXITCODE -ne 0) { throw 'Backend build failed. See Maven output.' }
    } finally { Pop-Location }
}
& (Join-Path $PSScriptRoot 'start-dev.ps1') -BackendOnly
