param([ValidateSet('fake','live')][string]$Mode = 'live', [string]$Model = 'qwen3:8b', [switch]$ProductionApi)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force $runtime | Out-Null
$apiEnv = Join-Path $repo 'apps/api/.env.local'
if (-not (Test-Path $apiEnv)) { throw 'Run setup-local.ps1 first.' }
$tokenLine = Get-Content $apiEnv | Where-Object { $_ -match '^AUTOMATION_INTERNAL_TOKEN=' } | Select-Object -First 1
if (-not $tokenLine) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $tokenLine = 'AUTOMATION_INTERNAL_TOKEN=' + [Convert]::ToBase64String($bytes)
  Add-Content -LiteralPath $apiEnv -Value $tokenLine
}
$env:AUTOMATION_INTERNAL_TOKEN = $tokenLine.Substring('AUTOMATION_INTERNAL_TOKEN='.Length)
$env:DATABASE_URL = ((Get-Content $apiEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=','')
$dbUri = [Uri]$env:DATABASE_URL
$env:QUEUE_HOST = $dbUri.Host
$env:QUEUE_PORT = [string]$dbUri.Port
$env:QUEUE_DATABASE = $dbUri.AbsolutePath.TrimStart('/')
$userInfo = $dbUri.UserInfo.Split(':',2)
$env:QUEUE_USER = [Uri]::UnescapeDataString($userInfo[0])
$env:QUEUE_PASSWORD = [Uri]::UnescapeDataString($userInfo[1])
$env:API_BASE_URL = 'http://127.0.0.1:4000'
$env:AI_PROVIDER_MODE = 'live' # HTTP adapter in either mode
$env:AI_SERVICE_BASE_URL = 'http://127.0.0.1:5000'
$env:LLM_PROVIDER_MODE = $Mode
$env:LLM_MODEL = $Model
$env:INTERNAL_AI_AUTH_TOKEN = $env:AUTOMATION_INTERNAL_TOKEN
function Start-AgentProcess($name, $exe, $arguments, $directory, $port) {
  if ($port -and (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { throw "Port $port already in use; inspect the existing process before restarting." }
  $process = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "$name.stdout.log") -RedirectStandardError (Join-Path $runtime "$name.stderr.log")
  @{ name=$name; pid=$process.Id; started_at=$process.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content (Join-Path $runtime "$name.process.json")
  Write-Output "$name started (PID $($process.Id))"
}
foreach ($name in @('api','web','ai','worker')) {
  $statePath = Join-Path $runtime "$name.process.json"
  if (Test-Path $statePath) {
    $state = Get-Content $statePath | ConvertFrom-Json
    $existing = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($existing -and $existing.StartTime.ToUniversalTime().ToString('o') -eq $state.started_at) { throw "$name already running; inspect .runtime/$name.process.json" }
  }
}
$apiCommand = if ($ProductionApi) { 'start' } else { 'dev' }
Start-AgentProcess 'api' (Get-Command node.exe).Source @('--env-file=.env.local','node_modules/next/dist/bin/next',$apiCommand,'--hostname','127.0.0.1','--port','4000') (Join-Path $repo 'apps/api') 4000
Start-AgentProcess 'web' (Get-Command node.exe).Source @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000') (Join-Path $repo 'apps/web') 3000
Start-AgentProcess 'ai' (Get-Command python.exe).Source @('-m','uvicorn','src.app.main:app','--app-dir','services/ai','--host','127.0.0.1','--port','5000') $repo 5000
Start-AgentProcess 'worker' (Get-Command node.exe).Source @('--import','tsx','src/main.ts') (Join-Path $repo 'apps/worker') 0
Write-Output 'Dashboard: http://localhost:3000/agents (requires login). Logs: infra/staging/.runtime/'
Write-Output "AI mode: $Mode; generation model: $Model. Live readiness also requires embeddinggemma:latest."
