param(
    [switch]$WithoutAdmin
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$logRoot = Join-Path $runtimeRoot 'logs'
$pidRoot = Join-Path $runtimeRoot 'pids'
New-Item -ItemType Directory -Force -Path $logRoot, $pidRoot | Out-Null

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
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
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

Write-Host 'Starting MySQL, Redis and MinIO ...'
docker compose -f (Join-Path $projectRoot 'compose.dev.yml') up -d
if ($LASTEXITCODE -ne 0) { throw 'Docker infrastructure failed to start.' }
Wait-Port 13306
Wait-Port 6379
Wait-Port 9000

Start-ManagedProcess 'provider' 'node.exe' @('server.mjs') (Join-Path $projectRoot 'vibe-music-provider')
Wait-Port 3001 30

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
Start-ManagedProcess 'backend' 'java.exe' @(
    '-jar',
    $backendJar,
    "--spring.config.additional-location=$configUri"
) $backendDir
Wait-Port 8080 180

$clientVite = Join-Path $projectRoot 'vibe-music-client\node_modules\vite\bin\vite.js'
Start-ManagedProcess 'client' 'node.exe' @($clientVite, '--host', '0.0.0.0') (Join-Path $projectRoot 'vibe-music-client')
Wait-Port 8090 180

if (-not $WithoutAdmin) {
    $adminVite = Join-Path $projectRoot 'vibe-music-admin\node_modules\vite\bin\vite.js'
    Start-ManagedProcess 'admin' 'node.exe' @($adminVite, '--host', '0.0.0.0') (Join-Path $projectRoot 'vibe-music-admin')
    Wait-Port 8089 180
}

Write-Host ''
Write-Host 'Vibe Music is ready:' -ForegroundColor Green
Write-Host '  User client:  http://localhost:8090'
if (-not $WithoutAdmin) { Write-Host '  Admin client: http://localhost:8089' }
Write-Host '  Backend API:  http://localhost:8080'
Write-Host '  MinIO console:http://localhost:9001  (minioadmin / minioadmin)'
Write-Host "  Logs:         $logRoot"
