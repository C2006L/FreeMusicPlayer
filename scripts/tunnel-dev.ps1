param(
    [switch]$Stop,
    # Directory that holds the auto-downloaded cloudflared.exe. The self-test
    # points this at a temporary directory so the real binary is never touched.
    [string]$ToolsDir
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$logRoot = Join-Path $runtimeRoot 'logs'
$pidRoot = Join-Path $runtimeRoot 'pids'
$envFile = Join-Path $runtimeRoot 'tunnel.env'
if (-not $ToolsDir) { $ToolsDir = Join-Path $runtimeRoot 'tools' }
$localCloudflared = Join-Path $ToolsDir 'cloudflared.exe'
$defaultDownloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$minimumDownloadBytes = 20MB
New-Item -ItemType Directory -Force -Path $logRoot, $pidRoot | Out-Null

function Stop-Tunnel([string]$Name) {
    $pidFile = Join-Path $pidRoot "$Name.pid"
    if (-not (Test-Path $pidFile)) { return }
    $tunnelPid = [int](Get-Content $pidFile -Raw)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelPid" -ErrorAction SilentlyContinue
    if ($process -and $process.Name -eq 'cloudflared.exe') {
        Stop-Process -Id $tunnelPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

if ($Stop) {
    Stop-Tunnel 'tunnel-client'
    Stop-Tunnel 'tunnel-api'
    Remove-Item $envFile -ErrorAction SilentlyContinue
    Write-Host 'Tunnels stopped and .runtime/tunnel.env removed.'
    return
}

# A binary counts as usable only when it runs and prints the expected version line.
function Test-Cloudflared([string]$Path) {
    if (-not $Path -or -not (Test-Path $Path)) { return $false }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = (& $Path --version 2>&1 | Out-String)
        return ($output -match 'cloudflared version \d+\.\d+\.\d+')
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previous
    }
}

# PATH wins, then the tools directory; anything that cannot execute is ignored.
function Resolve-Cloudflared {
    $command = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($command -and (Test-Cloudflared $command.Source)) { return $command.Source }
    if (Test-Cloudflared $localCloudflared) { return $localCloudflared }
    return $null
}

function Get-DownloadFailureReason([Exception]$ErrorValue) {
    if ($ErrorValue -is [System.Net.WebException]) { return "network: $($ErrorValue.Status)" }
    if ($ErrorValue.PSObject.Properties['StatusCode']) { return "http: $($ErrorValue.StatusCode)" }
    return "error: $($ErrorValue.Message)"
}

function Install-Cloudflared {
    $url = if ($env:FMP_CLOUDFLARED_URL) { $env:FMP_CLOUDFLARED_URL } else { $defaultDownloadUrl }
    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
    # Keep the .exe extension so the download can be executed before being moved.
    $temp = Join-Path $ToolsDir ("cloudflared-download-{0}.exe" -f [Guid]::NewGuid().ToString('N'))
    Write-Host 'cloudflared was not found or is not runnable; fetching a copy ...'
    Write-Host "  source: $url"
    Write-Host "  target: $localCloudflared"
    $previousProgress = $ProgressPreference
    $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
    $ProgressPreference = 'SilentlyContinue'
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing -TimeoutSec 300
    } catch {
        $reason = Get-DownloadFailureReason $_.Exception
        Write-Host ''
        Write-Host "cloudflared download failed ($reason)." -ForegroundColor Yellow
        Write-Host 'Run the one-line fix that matches your case, then re-run this script:'
        Write-Host '  network/DNS:   Test-NetConnection github.com -Port 443   (still fails: change network, or set FMP_CLOUDFLARED_URL to a mirror)'
        Write-Host '  proxy/VPN:     $env:HTTPS_PROXY=''http://127.0.0.1:7890''   (your proxy port, or disconnect the VPN)'
        Write-Host "  interrupted:   Remove-Item '$ToolsDir\cloudflared-download-*.exe' -Force; re-run, or curl.exe -L '$url' -o '$localCloudflared'"
        Write-Host "  antivirus:     Add-MpPreference -ExclusionPath '$ToolsDir'   (admin shell), or whitelist the exe"
        Write-Host '  mirror source: $env:FMP_CLOUDFLARED_URL=''https://<mirror>/cloudflared-windows-amd64.exe'''
        throw "cloudflared download failed ($reason)."
    } finally {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
        $ProgressPreference = $previousProgress
    }
    if (-not (Test-Path $temp)) { throw 'cloudflared download produced no file.' }
    $size = (Get-Item $temp).Length
    if ($size -lt $minimumDownloadBytes) {
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        throw "Downloaded file is only $size bytes, expected at least $minimumDownloadBytes. The URL returned something other than the cloudflared binary; check FMP_CLOUDFLARED_URL."
    }
    if (-not (Test-Cloudflared $temp)) {
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        throw "Downloaded file cannot run 'cloudflared --version'. Antivirus may be blocking it; whitelist $ToolsDir and re-run."
    }
    # Same-directory move: the final path only appears once the file is complete and verified.
    Move-Item -Path $temp -Destination $localCloudflared -Force
    Write-Host "cloudflared verified: $((& $localCloudflared --version | Out-String).Trim())"
    return $localCloudflared
}

$cloudflared = Resolve-Cloudflared
if ($cloudflared) {
    Write-Host "cloudflared: $cloudflared (download skipped)"
} else {
    $cloudflared = Install-Cloudflared
}

Stop-Tunnel 'tunnel-client'
Stop-Tunnel 'tunnel-api'

function Start-Tunnel([string]$Name, [int]$Port) {
    $stdout = Join-Path $logRoot "$Name.out.log"
    $stderr = Join-Path $logRoot "$Name.err.log"
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $cloudflared `
        -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$Port", '--no-autoupdate') `
        -WorkingDirectory $runtimeRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -Path (Join-Path $pidRoot "$Name.pid") -Value $process.Id
    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Milliseconds 500
        $log = (Get-Content $stdout -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue)
        $match = [regex]::Match($log, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { return $match.Value }
    } while ((Get-Date) -lt $deadline)
    throw "Tunnel $Name did not become ready in 90 seconds. See $stderr"
}

$clientUrl = Start-Tunnel 'tunnel-client' 8090
$apiUrl = Start-Tunnel 'tunnel-api' 18080

$lines = @(
    "# generated by scripts/tunnel-dev.ps1 at $(Get-Date -Format o)",
    "FMP_TUNNEL_CLIENT=$clientUrl",
    "FMP_TUNNEL_API=$apiUrl",
    "VITE_APP_BASE_API=$apiUrl",
    "VIBE_MUSIC_PROVIDER_PUBLIC_URL=$apiUrl/song",
    "FMP_ALLOWED_ORIGINS=$clientUrl,http://localhost:8090,http://127.0.0.1:8090"
) -join "`n"
[System.IO.File]::WriteAllText($envFile, $lines, [System.Text.Encoding]::ASCII)

Write-Host ''
Write-Host 'Temporary public tunnels are up:' -ForegroundColor Green
Write-Host "  Client: $clientUrl  ->  http://127.0.0.1:8090"
Write-Host "  API:    $apiUrl  ->  http://127.0.0.1:18080"
Write-Host "  Env:    $envFile"
Write-Host ''
Write-Host 'Next:   .\scripts\start-dev.ps1 -Tunnel   (restart backend/client with these URLs)'
Write-Host 'Stop:   .\scripts\tunnel-dev.ps1 -Stop     (when the demo is over)'
