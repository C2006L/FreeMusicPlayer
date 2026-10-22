param(
    [switch]$SkipDockerPull
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$previousNpmCache = $env:NPM_CONFIG_CACHE
$previousCi = $env:CI
$env:NPM_CONFIG_CACHE = Join-Path $runtimeRoot 'npm-cache'
$env:CI = 'true'

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'm2') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'pnpm-store') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'npm-cache') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'pids') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'go-music-api') | Out-Null
$goMusicCookies = Join-Path $runtimeRoot 'go-music-api\cookies.json'
if (-not (Test-Path $goMusicCookies)) { Set-Content -Path $goMusicCookies -Value '{}' -Encoding utf8 }

Write-Host 'Installing provider dependencies on D: ...'
Push-Location (Join-Path $projectRoot 'vibe-music-provider')
try {
    npm install --cache (Join-Path $runtimeRoot 'npm-cache')
    if ($LASTEXITCODE -ne 0) { throw 'Provider dependency installation failed.' }
} finally {
    Pop-Location
}

Write-Host 'Installing client dependencies on D: ...'
Push-Location (Join-Path $projectRoot 'vibe-music-client')
try {
    npx --yes pnpm@9.15.2 install --frozen-lockfile --store-dir (Join-Path $runtimeRoot 'pnpm-store')
    if ($LASTEXITCODE -ne 0) { throw 'Client dependency installation failed.' }
} finally {
    Pop-Location
}

Write-Host 'Installing admin dependencies on D: ...'
Push-Location (Join-Path $projectRoot 'vibe-music-admin')
try {
    npx --yes pnpm@9.15.2 install --frozen-lockfile --store-dir (Join-Path $runtimeRoot 'pnpm-store')
    if ($LASTEXITCODE -ne 0) { throw 'Admin dependency installation failed.' }
} finally {
    Pop-Location
}

Write-Host 'Preparing Maven dependencies on D: ...'
Push-Location (Join-Path $projectRoot 'vibe-music-backend')
try {
    & .\mvnw.cmd "-Dmaven.repo.local=$(Join-Path $runtimeRoot 'm2')" -DskipTests package
    if ($LASTEXITCODE -ne 0) { throw 'Maven dependency preparation failed.' }
} finally {
    Pop-Location
}

if (-not $SkipDockerPull) {
    Write-Host 'Downloading infrastructure images ...'
    docker compose -f (Join-Path $projectRoot 'compose.dev.yml') pull
    if ($LASTEXITCODE -ne 0) { throw 'Docker image download failed. Confirm Docker Desktop is running.' }
}

Write-Host ''
Write-Host 'Environment setup complete. All writable caches and service data are under:' -ForegroundColor Green
Write-Host $runtimeRoot -ForegroundColor Green
Write-Host 'Run: .\scripts\start-dev.ps1'

if ($null -eq $previousNpmCache) {
    Remove-Item Env:NPM_CONFIG_CACHE -ErrorAction SilentlyContinue
} else {
    $env:NPM_CONFIG_CACHE = $previousNpmCache
}
if ($null -eq $previousCi) {
    Remove-Item Env:CI -ErrorAction SilentlyContinue
} else {
    $env:CI = $previousCi
}
