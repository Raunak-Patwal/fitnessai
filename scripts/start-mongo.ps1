$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot ".mongo-data"
$logDir = Join-Path $repoRoot ".mongo-log"
$logFile = Join-Path $logDir "mongod.log"
$mongod = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"

if (-not (Test-Path $mongod)) {
  throw "mongod.exe not found at $mongod"
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$existing = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($existing) {
  Write-Output "MongoDB already running on 127.0.0.1:27017 (PID $($existing.OwningProcess))"
  exit 0
}

$shortRoot = (cmd.exe /c "for %I in (""$repoRoot"") do @echo %~sI").Trim()

if (-not $shortRoot) {
  throw "Could not resolve short path for $repoRoot"
}

$args = @(
  "--dbpath", "$shortRoot\.mongo-data",
  "--bind_ip", "127.0.0.1",
  "--port", "27017",
  "--logpath", "$shortRoot\.mongo-log\mongod.log"
)

$process = Start-Process -FilePath $mongod -ArgumentList $args -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3

if ($process.HasExited) {
  throw "MongoDB failed to start. Check $logFile"
}

Write-Output "MongoDB started on 127.0.0.1:27017 (PID $($process.Id))"
