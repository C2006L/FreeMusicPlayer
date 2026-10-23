param([Parameter(Mandatory)][string]$BackupPath, [switch]$ConfirmRestore)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'Restore overwrites matching database records. Back up first, stop the backend, then pass -ConfirmRestore.' }
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if ([System.IO.Path]::GetExtension($resolvedBackup) -ne '.sql') { throw 'Expected an SQL backup file.' }
docker cp $resolvedBackup vibe-music-mysql:/tmp/fmp-restore.sql
if ($LASTEXITCODE -ne 0) { throw 'Backup upload failed.' }
docker exec vibe-music-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot vibe_music < /tmp/fmp-restore.sql'
if ($LASTEXITCODE -ne 0) { throw 'Database restore failed.' }
Write-Host 'Database restored. Restart the backend to run schema checks.'
