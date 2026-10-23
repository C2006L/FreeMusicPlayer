param(
    [switch]$WithoutAdmin,
    [switch]$WithMinio,
    [switch]$WithMail,
    [switch]$BackendOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$logRoot = Join-Path $runtimeRoot 'logs'
$pidRoot = Join-Path $runtimeRoot 'pids'
New-Item -ItemType Directory -Force -Path $logRoot, $pidRoot | Out-Null
$goMusicRuntime = Join-Path $runtimeRoot 'go-music-api'
New-Item -ItemType Directory -Force -Path $goMusicRuntime | Out-Null
$goMusicCookies = Join-Path $goMusicRuntime 'cookies.json'
if (-not (Test-Path $goMusicCookies)) { Set-Content -Path $goMusicCookies -Value '{}' -Encoding utf8 }

# Keep the development JWT secret outside source control and stable across restarts.
$jwtSecretFile = Join-Path $runtimeRoot 'jwt-secret.txt'
if (-not (Test-Path $jwtSecretFile)) {
    $secretBytes = New-Object byte[] 48
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
    [System.IO.File]::WriteAllText($jwtSecretFile, [Convert]::ToBase64String($secretBytes))
}
$env:VIBE_MUSIC_JWT_SECRET = ([System.IO.File]::ReadAllText($jwtSecretFile)).Trim()
$backendPort = if ($env:FMP_BACKEND_PORT) { [int]$env:FMP_BACKEND_PORT } else { 18080 }
$env:VITE_APP_BASE_API = "http://localhost:$backendPort"

function Wait-Port([int]$Port, [int]$TimeoutSeconds = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $task = $client.ConnectAsync('127.0.0.1', $Port)
            if ($task.Wait(500) -and $client.Connected) { return }
        } catch {
        } finally {
            $client.Dispose()
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Port $Port did not become ready within $TimeoutSeconds seconds."
}

function Start-ManagedProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
) {
    $pidFile = Join-Path $pidRoot "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPid = [int](Get-Content $pidFile -Raw)
        $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
        if ($existingProcess -and $existingProcess.CommandLine -like "*$WorkingDirectory*") {
            Write-Host "$Name is already running (PID $oldPid)."
            return
        }
    }
    $stdout = Join-Path $logRoot "$Name.out.log"
    $stderr = Join-Path $logRoot "$Name.err.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -Path $pidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))."
}

if (-not $BackendOnly) {
if ($WithMinio) {
    Write-Host 'Starting MySQL, Redis and optional MinIO ...'
    docker compose -f (Join-Path $projectRoot 'compose.dev.yml') --profile media up -d
} else {
    Write-Host 'Starting MySQL and Redis (MinIO disabled) ...'
    docker compose -f (Join-Path $projectRoot 'compose.dev.yml') --profile media stop minio minio-init 2>$null
    docker compose -f (Join-Path $projectRoot 'compose.dev.yml') up -d mysql redis go-music-api
}
if ($LASTEXITCODE -ne 0) { throw 'Docker infrastructure failed to start.' }
Wait-Port 13306
Wait-Port 6379
Wait-Port 3002 120
if ($WithMinio) { Wait-Port 9000 }
if ($WithMail) {
    docker compose -f (Join-Path $projectRoot 'compose.dev.yml') --profile mail up -d mailpit
    if ($LASTEXITCODE -ne 0) { throw 'Local test mailbox failed to start.' }
}

$env:GO_MUSIC_API_URL = 'http://127.0.0.1:3002'
Start-ManagedProcess 'provider' 'node.exe' @((Join-Path $projectRoot 'vibe-music-provider\server.mjs')) (Join-Path $projectRoot 'vibe-music-provider')
Wait-Port 3001 30
}

$backendDir = Join-Path $projectRoot 'vibe-music-backend\vibe-music-server'
$backendJar = Join-Path $backendDir 'target\vibe-music-server-0.0.1-SNAPSHOT.jar'
$dockerConfig = Join-Path $projectRoot 'config\application-docker.yml'
if (-not (Test-Path $backendJar)) {
    throw 'Backend JAR is missing. Run .\scripts\setup-dev.ps1 first.'
}
if (-not (Test-Path $dockerConfig)) {
    throw "Docker development config is missing: $dockerConfig"
}
$configUri = ([System.Uri]$dockerConfig).AbsoluteUri
$minioEnabled = $WithMinio.ToString().ToLowerInvariant()
Start-ManagedProcess 'backend' 'java.exe' @(
    '-jar',
    $backendJar,
    "--spring.config.additional-location=$configUri",
    "--vibe-music.minio.enabled=$minioEnabled"
) $backendDir
Wait-Port $backendPort 180
$healthDeadline = (Get-Date).AddSeconds(45)
$healthy = $false
do {
    $health = $null
    try { $health = Invoke-RestMethod "http://localhost:$backendPort/health" -TimeoutSec 10 } catch {
        if ($_.Exception.Message -match '404') { throw "Port $backendPort has no FreeMusicPlayer health endpoint. Check the owning application." }
    }
    if ($health) {
        if ($health.application -ne 'FreeMusicPlayer' -or $health.apiVersion -ne 2) {
            throw "Port $backendPort is not running the expected FreeMusicPlayer API. Check the owning application."
        }
        if ($health.status -eq 'UP') { $healthy = $true; break }
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $healthDeadline)
if (-not $healthy) { throw 'FreeMusicPlayer dependencies did not become ready. Open /health for details.' }
if ($BackendOnly) { Write-Host "FreeMusicPlayer backend ready: http://localhost:$backendPort"; return }

$clientVite = Join-Path $projectRoot 'vibe-music-client\node_modules\vite\bin\vite.js'
Start-ManagedProcess 'client' 'node.exe' @($clientVite, '--host', '0.0.0.0') (Join-Path $projectRoot 'vibe-music-client')
Wait-Port 8090 180

if (-not $WithoutAdmin) {
    $adminVite = Join-Path $projectRoot 'vibe-music-admin\node_modules\vite\bin\vite.js'
    Start-ManagedProcess 'admin' 'node.exe' @($adminVite, '--host', '0.0.0.0') (Join-Path $projectRoot 'vibe-music-admin')
    Wait-Port 8089 180
}

Write-Host ''
Write-Host 'FreeMusicPlayer is ready:' -ForegroundColor Green
Write-Host '  User client:  http://localhost:8090'
if (-not $WithoutAdmin) { Write-Host '  Admin client: http://localhost:8089' }
Write-Host "  Backend API:  http://localhost:$backendPort"
Write-Host '  Source API:   http://localhost:3002'
if ($WithMinio) { Write-Host '  MinIO console:http://localhost:9001  (minioadmin / minioadmin)' }
if ($WithMail) { Write-Host '  Test mailbox: http://localhost:8025 (local test emails only)' }
Write-Host "  Logs:         $logRoot"
