$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot '.runtime\backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$backupPath = Join-Path $backupRoot ("vibe-music-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
docker exec vibe-music-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces --result-file=/tmp/fmp-backup.sql vibe_music'
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed.' }
docker cp vibe-music-mysql:/tmp/fmp-backup.sql $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed.' }
Write-Host "Backup saved: $backupPath"
