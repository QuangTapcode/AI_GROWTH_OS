param(
    [ValidateSet('fake','live')][string]$Mode = 'live',
    [ValidateSet('fake','production')][string]$IntegrationMode
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtime = Join-Path $PSScriptRoot '.runtime'
$apiEnvPath = Join-Path $repo 'apps/api/.env.local'
$infraEnvPath = Join-Path $repo 'infra/local/.env'
$workerRoot = Join-Path $repo 'apps/worker'

if (-not (Test-Path -LiteralPath $apiEnvPath)) { throw 'Run setup-local.ps1 first.' }
if (-not (Test-Path -LiteralPath $infraEnvPath)) { throw 'Run setup-local.ps1 first.' }

function Read-EnvValue([string]$path, [string]$name) {
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match ('^' + [regex]::Escape($name) + '=') } | Select-Object -First 1
    if (-not $line) { return '' }
    return $line.Substring($name.Length + 1).Trim()
}

$tokenLine = Get-Content -LiteralPath $apiEnvPath | Where-Object { $_ -match '^AUTOMATION_INTERNAL_TOKEN=' } | Select-Object -First 1
if (-not $tokenLine) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $tokenLine = 'AUTOMATION_INTERNAL_TOKEN=' + [Convert]::ToBase64String($bytes)
    Add-Content -LiteralPath $apiEnvPath -Value $tokenLine
}
$env:AUTOMATION_INTERNAL_TOKEN = $tokenLine.Substring('AUTOMATION_INTERNAL_TOKEN='.Length)
$configuredIntegration = Read-EnvValue $apiEnvPath 'INTEGRATION_MODE'
$env:INTEGRATION_MODE = if ($IntegrationMode) { $IntegrationMode } elseif ($configuredIntegration) { $configuredIntegration } else { 'fake' }
# Publishing credentials are read only by the worker publisher. They remain
# server-side and are never printed or returned by the API.
foreach ($name in @('FACEBOOK_PAGE_ID','FACEBOOK_PAGE_ACCESS_TOKEN','TIKTOK_ACCESS_TOKEN','TIKTOK_OPEN_ID','TIKTOK_DIRECT_POST_ENABLED','TIKTOK_API_BASE_URL','WORKER_GATEWAY_TOKEN')) {
    Set-Item -Path ('Env:' + $name) -Value (Read-EnvValue $apiEnvPath $name)
}
$env:API_BASE_URL = 'http://127.0.0.1:4000'

$env:APP_ENV = 'local'
$env:NODE_ENV = 'local'
$env:QUEUE_HOST = '127.0.0.1'
$env:QUEUE_PORT = '15432'
$env:QUEUE_DATABASE = 'ai_growth_os'
$env:QUEUE_USER = 'ai_growth_dev'
$env:QUEUE_PASSWORD = Read-EnvValue $infraEnvPath 'POSTGRES_PASSWORD'
$env:PG_HOST = '127.0.0.1'
$env:PG_PORT = '15432'
$env:PG_DATABASE = 'ai_growth_os'
$env:PG_USER = 'ai_growth_dev'
$env:PG_PASSWORD = $env:QUEUE_PASSWORD
$encodedUser = [Uri]::EscapeDataString([string]$env:PG_USER)
$encodedPassword = [Uri]::EscapeDataString([string]$env:PG_PASSWORD)
$env:DATABASE_URL = 'postgres://' + $encodedUser + ':' + $encodedPassword + '@' + $env:PG_HOST + ':' + $env:PG_PORT + '/' + $env:PG_DATABASE
$env:QUEUE_NAME = 'ai-growth-os-queue'
$env:AI_PROVIDER_MODE = 'live'
$env:AI_SERVICE_BASE_URL = 'http://127.0.0.1:5000'
$env:LLM_PROVIDER_MODE = $Mode
$env:WORKER_STATE_DIR = '.worker-state-live'

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$node = (Get-Command node.exe).Source
$process = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'src/main.ts') -WorkingDirectory $workerRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtime 'worker-live.stdout.log') `
    -RedirectStandardError (Join-Path $runtime 'worker-live.stderr.log')

[pscustomobject]@{ Name = 'worker-live'; ProcessId = $process.Id; StartedAt = $process.StartTime.ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $runtime 'worker-live.process.json')
Write-Output ('worker-live started (PID ' + $process.Id + ')')
