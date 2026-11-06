param(
    [switch]$WithoutAdmin,
    [switch]$WithMinio,
    [switch]$WithMail,
    [switch]$BackendOnly,
    # Admin UI listens on 127.0.0.1 by default; enable only for LAN demos.
    [switch]$ExposeAdmin,
    # Start two cloudflared quick tunnels and point the client/API/CORS at them.
    [switch]$Tunnel
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
# Phone/tablet access: set FMP_PUBLIC_HOST to this machine's LAN IP. Existing
# VITE_APP_BASE_API / VIBE_MUSIC_PROVIDER_PUBLIC_URL values are never overwritten,
# so localhost remains the default for normal desktop development.
$publicHost = $env:FMP_PUBLIC_HOST
if (-not $env:VITE_APP_BASE_API) {
    $env:VITE_APP_BASE_API = if ($publicHost) { "http://${publicHost}:$backendPort" } else { "http://localhost:$backendPort" }
}
if ($publicHost -and -not $env:VIBE_MUSIC_PROVIDER_PUBLIC_URL) {
    $env:VIBE_MUSIC_PROVIDER_PUBLIC_URL = "http://${publicHost}:$backendPort/song"
}
# The client and API run on different ports, so a phone loading the LAN page
# sends a LAN Origin. Keep localhost entries and add the LAN origins.
if ($publicHost -and -not $env:FMP_ALLOWED_ORIGINS) {
    $env:FMP_ALLOWED_ORIGINS = "http://${publicHost}:8090,http://${publicHost}:8089,http://localhost:8090,http://127.0.0.1:8090,http://localhost:8089,http://127.0.0.1:8089"
}

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

function Stop-ProjectListener([int]$Port) {
    if ($Port -le 0) { return }
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
        if ($owner -and $owner.CommandLine -and $owner.CommandLine -like "*$projectRoot*") {
            Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped stale listener on port $Port (PID $ownerPid)."
            Start-Sleep -Milliseconds 500
        }
    }
}

function Start-ManagedProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [int]$Port = 0
) {
    $pidFile = Join-Path $pidRoot "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPid = [int](Get-Content $pidFile -Raw)
        $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
        if ($existingProcess -and $existingProcess.CommandLine -like "*$WorkingDirectory*") {
            Write-Host "$Name is already running (PID $oldPid)."
            return
        }
        Remove-Item $pidFile -ErrorAction SilentlyContinue
    }
    # A previous run (or a tunnel demo) may still own the port without a live
    # pid file. Only processes from this project are stopped, so an unrelated
    # application on the same port is never touched.
    Stop-ProjectListener $Port
    $stdout = Join-Path $logRoot "$Name.out.log"
    $stderr = Join-Path $logRoot "$Name.err.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -Path $pidFile -Value $process.Id
    Write-Host "Started $Name (PID $($process.Id))."
}

function Stop-ManagedProcess([string]$Name) {
    $pidFile = Join-Path $pidRoot "$Name.pid"
    if (-not (Test-Path $pidFile)) { return }
    $processId = [int](Get-Content $pidFile -Raw)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine -like '*vibe-music*') {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $Name (PID $processId)."
        Start-Sleep -Milliseconds 800
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

if ($Tunnel) {
    # Tunnels are started first so their random public URLs can be applied to
    # the client bundle, the backend media URLs and the CORS allow-list.
    & (Join-Path $PSScriptRoot 'tunnel-dev.ps1')
    $tunnelEnv = Join-Path $runtimeRoot 'tunnel.env'
    if (-not (Test-Path $tunnelEnv)) {
        throw 'Tunnel URLs were not written to .runtime/tunnel.env.'
    }
    Get-Content $tunnelEnv | ForEach-Object {
        if ($_ -match '^([A-Z0-9_]+)=(\S+)$') {
            Set-Item -Path "env:$($matches[1])" -Value $matches[2]
        }
    }
    # The admin console is intentionally not exposed publicly.
    $WithoutAdmin = $true
    Stop-ManagedProcess 'backend'
    Stop-ManagedProcess 'client'
    Stop-ManagedProcess 'admin'
    $releaseDeadline = (Get-Date).AddSeconds(15)
    while ((Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $releaseDeadline) {
        Start-Sleep -Milliseconds 500
    }
}

# Remember whether the running processes were started for a tunnel or for
# localhost. A tunnel demo leaves .env values in the child processes, so a
# plain start afterwards must restart them instead of reusing stale URLs.
$modeFile = Join-Path $runtimeRoot 'dev-mode.txt'
$mode = if ($Tunnel) { 'tunnel' } else { 'local' }
if (-not $Tunnel) {
    $tunnelEnv = Join-Path $runtimeRoot 'tunnel.env'
    if (Test-Path $tunnelEnv) {
        Write-Host 'Stopping leftover tunnels for local mode ...'
        & (Join-Path $PSScriptRoot 'tunnel-dev.ps1') -Stop
    }
}
$previousMode = if (Test-Path $modeFile) { (Get-Content $modeFile -Raw).Trim() } else { '' }
if ($previousMode -and $previousMode -ne $mode -and -not $Tunnel) {
    Write-Host "Switching from $previousMode mode to $mode mode; restarting managed processes ..."
    Stop-ManagedProcess 'backend'
    Stop-ManagedProcess 'client'
    Stop-ManagedProcess 'admin'
}

if (-not $BackendOnly) {
# docker compose writes progress to stderr. With ErrorActionPreference 'Stop'
# PowerShell turns that into a terminating NativeCommandError, which aborts
# this script when it runs detached or with redirected output. Run docker with
# 'Continue' and judge success by exit code only.
function Invoke-Docker([string[]]$DockerArguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker @DockerArguments 2>&1 | ForEach-Object { Write-Host $_ }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}
$composeFile = Join-Path $projectRoot 'compose.dev.yml'
if ($WithMinio) {
    Write-Host 'Starting MySQL, Redis and optional MinIO ...'
    $dockerExit = Invoke-Docker @('compose', '-f', $composeFile, '--profile', 'media', 'up', '-d')
} else {
    Write-Host 'Starting MySQL and Redis (MinIO disabled) ...'
    Invoke-Docker @('compose', '-f', $composeFile, '--profile', 'media', 'stop', 'minio', 'minio-init') | Out-Null
    $dockerExit = Invoke-Docker @('compose', '-f', $composeFile, 'up', '-d', 'mysql', 'redis', 'go-music-api')
}
if ($dockerExit -ne 0) { throw 'Docker infrastructure failed to start.' }
Wait-Port 13306
Wait-Port 6379
Wait-Port 3002 120
if ($WithMinio) { Wait-Port 9000 }
if ($WithMail) {
    $dockerExit = Invoke-Docker @('compose', '-f', $composeFile, '--profile', 'mail', 'up', '-d', 'mailpit')
    if ($dockerExit -ne 0) { throw 'Local test mailbox failed to start.' }
    # 本机 Mailpit 只用于开发调试。默认不允许往本机接收器投递（验证码接口会直接报错），
    # 显式加上 -WithMail 才放宽，验证码可在 http://localhost:8025 查看。
    $env:FMP_MAIL_ALLOW_LOCAL = 'true'
}

$env:GO_MUSIC_API_URL = 'http://127.0.0.1:3002'
Start-ManagedProcess 'provider' 'node.exe' @((Join-Path $projectRoot 'vibe-music-provider\supervise.mjs')) (Join-Path $projectRoot 'vibe-music-provider') -Port 3001
Wait-Port 3001 30
}

$backendDir = Join-Path $projectRoot 'vibe-music-backend\vibe-music-server'
$backendJar = Join-Path $backendDir 'target\vibe-music-server-0.0.1-SNAPSHOT.jar'
$dockerConfig = Join-Path $projectRoot 'config\application-docker.yml'
if (-not (Test-Path $backendJar)) {
    # `mvn test` or `mvn clean` leaves no runnable jar, so a plain start used to
    # stop here and ask for a separate setup step. Build it once, tests skipped.
    $mavenRoot = Join-Path $projectRoot 'vibe-music-backend'
    $mavenWrapper = Join-Path $mavenRoot 'mvnw.cmd'
    if (-not (Test-Path $mavenWrapper)) {
        throw "Backend JAR is missing and $mavenWrapper was not found. Run .\scripts\setup-dev.ps1 once."
    }
    Write-Host 'Backend JAR is missing; building it now (tests skipped) ...'
    $mavenRepo = Join-Path $runtimeRoot 'm2'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $mavenRoot
    try {
        & $mavenWrapper "-Dmaven.repo.local=$mavenRepo" -DskipTests package 2>&1 | ForEach-Object { Write-Host $_ }
        $buildExit = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $previous
    }
    if ($buildExit -ne 0 -or -not (Test-Path $backendJar)) {
        throw "Backend build failed (exit $buildExit). Check the network and the Maven cache in .runtime\m2, or run .\scripts\setup-dev.ps1 once."
    }
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
) $backendDir -Port $backendPort
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
Start-ManagedProcess 'client' 'node.exe' @($clientVite, '--host', '0.0.0.0') (Join-Path $projectRoot 'vibe-music-client') -Port 8090
Wait-Port 8090 180

if (-not $WithoutAdmin) {
    $adminVite = Join-Path $projectRoot 'vibe-music-admin\node_modules\vite\bin\vite.js'
    $adminHost = if ($ExposeAdmin) { '0.0.0.0' } else { '127.0.0.1' }
    Start-ManagedProcess 'admin' 'node.exe' @($adminVite, '--host', $adminHost) (Join-Path $projectRoot 'vibe-music-admin') -Port 8089
    Wait-Port 8089 180
}

Set-Content -Path $modeFile -Value $mode -Encoding ascii

Write-Host ''
Write-Host 'FreeMusicPlayer is ready:' -ForegroundColor Green
if ($Tunnel) {
    Write-Host "  Public client: $env:FMP_TUNNEL_CLIENT"
    Write-Host "  Public API:    $env:FMP_TUNNEL_API/song"
    Write-Host '  Admin console stays local only (not tunnelled).'
    Write-Host '  Quit demo:  .\scripts\tunnel-dev.ps1 -Stop'
}
Write-Host '  User client:  http://localhost:8090'
if (-not $WithoutAdmin) { Write-Host '  Admin client: http://localhost:8089' }
Write-Host "  Backend API:  http://localhost:$backendPort"
Write-Host '  Source API:   http://localhost:3002'
if ($WithMinio) { Write-Host '  MinIO console:http://localhost:9001  (minioadmin / minioadmin)' }
if ($WithMail) { Write-Host '  Test mailbox: http://localhost:8025 (local test emails only)' }
Write-Host "  Logs:         $logRoot"
