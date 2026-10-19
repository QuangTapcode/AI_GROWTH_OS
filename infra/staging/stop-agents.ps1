$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.runtime'
foreach ($name in @('worker','ai','web','api')) {
  $statePath = Join-Path $runtime "$name.process.json"
  if (-not (Test-Path $statePath)) { continue }
  $state = Get-Content $statePath | ConvertFrom-Json
  $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  if ($process -and $process.StartTime.ToUniversalTime().ToString('o') -eq $state.started_at) {
    # Only processes recorded by start-agents.ps1 are stopped, including their children.
    & taskkill.exe /PID $state.pid /T /F | Out-Null
    Write-Output "$name stopped"
  }
}
