param(
    [switch]$Install,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtimeRoot = Join-Path $PSScriptRoot '.runtime'
$statePath = Join-Path $runtimeRoot 'processes.json'
$services = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'services.json') | ConvertFrom-Json
$nodeExecutable = (Get-Command node.exe).Source
$startedServices = @()

# Ensure local Docker containers (Postgres & SearXNG) are running when Docker is available.
$dockerCmd = Get-Command docker.exe -ErrorAction SilentlyContinue
if ($dockerCmd) {
    & $dockerCmd.Source start ai-growth-os-local-postgres-1 ai-growth-os-local-searxng-1 *> $null
}

$busyPorts = @()
foreach ($service in $services) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $service.port -ErrorAction SilentlyContinue
    if ($listener) { $busyPorts += $service.port }
}
if ($busyPorts.Count -gt 0) {
    throw ('Ports already in use: ' + ($busyPorts -join ', ') + '. Stop this staging with infra/staging/stop.ps1 before restarting. Other processes will not be stopped.')
}

foreach ($service in $services) {
    $appRoot = Join-Path $repoRoot $service.directory
    $localEnv = Join-Path $appRoot '.env.local'
    if (-not (Test-Path -LiteralPath $localEnv)) {
        Copy-Item -LiteralPath (Join-Path $appRoot '.env.example') -Destination $localEnv
    }
    if ($Install -or -not (Test-Path -LiteralPath (Join-Path $appRoot 'node_modules/next/dist/bin/next'))) {
        & npm.cmd --prefix $appRoot ci --no-fund
        if ($LASTEXITCODE -ne 0) { throw ('Install failed for ' + $service.name) }
    }
    if (-not $SkipBuild) {
        & npm.cmd --prefix $appRoot run build
        if ($LASTEXITCODE -ne 0) { throw ('Build failed for ' + $service.name) }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.next/BUILD_ID'))) {
        throw ('Missing production build for ' + $service.name + '. Run start.ps1 without -SkipBuild.')
    }
}

# Keep the API and the live worker on the same internal scheduler token. Next
# reads .env.local itself, but an explicit process env value makes the token
# inherited by every staging service deterministic across restarts.
$apiEnvPath = Join-Path $repoRoot 'apps/api/.env.local'
$automationTokenLine = Get-Content -LiteralPath $apiEnvPath | Where-Object { $_ -match '^AUTOMATION_INTERNAL_TOKEN=' } | Select-Object -First 1
if ($automationTokenLine) {
    $env:AUTOMATION_INTERNAL_TOKEN = $automationTokenLine.Substring('AUTOMATION_INTERNAL_TOKEN='.Length).Trim()
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
try {
    foreach ($service in $services) {
        $appRoot = Join-Path $repoRoot $service.directory
        $arguments = @('node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', [string]$service.port)
        $process = Start-Process -FilePath $nodeExecutable -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeRoot ($service.name + '.stdout.log')) `
            -RedirectStandardError (Join-Path $runtimeRoot ($service.name + '.stderr.log'))
        $startedServices += [pscustomobject]@{
            Name = $service.name
            Port = $service.port
            ProcessId = $process.Id
            StartedAtTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
            Executable = $nodeExecutable
        }
        $startedServices | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath $statePath
    }

    $deadline = (Get-Date).AddSeconds(45)
    do {
        $ready = 0
        foreach ($service in $services) {
            try {
                $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $service.port + '/health') -TimeoutSec 2
                if ($health.status -eq 'ok' -and $health.service -eq ('ai-growth-os-' + $service.name)) { $ready++ }
            } catch { }
        }
        if ($ready -eq $services.Count) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    if ($ready -ne $services.Count) { throw 'Staging did not become healthy. See infra/staging/.runtime/*.log.' }

    # Automatically start Python AI service (:5000) if not already listening
    $aiListener = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue
    $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $aiListener -and $pythonCmd) {
        $aiProcess = Start-Process -FilePath $pythonCmd.Source `
            -ArgumentList @('-m', 'uvicorn', 'src.app.main:app', '--app-dir', 'services/ai', '--host', '127.0.0.1', '--port', '5000') `
            -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeRoot 'ai.stdout.log') `
            -RedirectStandardError (Join-Path $runtimeRoot 'ai.stderr.log')
        $startedServices += [pscustomobject]@{
            Name = 'ai'
            Port = 5000
            ProcessId = $aiProcess.Id
            StartedAtTicks = $aiProcess.StartTime.ToUniversalTime().Ticks.ToString()
            Executable = $pythonCmd.Source
        }
        $startedServices | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath $statePath
    }

    # Automatically start Autopilot Worker (draft-main.ts + CommunityReplyRunner)
    $workerRoot = Join-Path $repoRoot 'apps/worker'
    $workerProcess = Start-Process -FilePath $nodeExecutable `
        -ArgumentList @('--import', 'tsx', 'src/draft-main.ts') `
        -WorkingDirectory $workerRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeRoot 'worker.stdout.log') `
        -RedirectStandardError (Join-Path $runtimeRoot 'worker.stderr.log')
    $startedServices += [pscustomobject]@{
        Name = 'worker'
        Port = 0
        ProcessId = $workerProcess.Id
        StartedAtTicks = $workerProcess.StartTime.ToUniversalTime().Ticks.ToString()
        Executable = $nodeExecutable
    }
    $startedServices | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath $statePath

    # Automatically start ngrok tunnel on port 4000 for Facebook Messenger webhook if ngrok is installed
    $ngrokListener = Get-NetTCPConnection -State Listen -LocalPort 4040 -ErrorAction SilentlyContinue
    $ngrokCandidates = @(
        (Get-Command ngrok.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if (-not $ngrokListener -and $ngrokCandidates.Count -gt 0) {
        $ngrokExecutable = $ngrokCandidates[0]
        $ngrokProcess = Start-Process -FilePath $ngrokExecutable `
            -ArgumentList @('http', '4000', '--log=stdout') `
            -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimeRoot 'ngrok.stdout.log') `
            -RedirectStandardError (Join-Path $runtimeRoot 'ngrok.stderr.log')
        $startedServices += [pscustomobject]@{
            Name = 'ngrok'
            Port = 4040
            ProcessId = $ngrokProcess.Id
            StartedAtTicks = $ngrokProcess.StartTime.ToUniversalTime().Ticks.ToString()
            Executable = $ngrokExecutable
        }
        $startedServices | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath $statePath
    }

    foreach ($service in $services) { Write-Output ($service.name + ': http://localhost:' + $service.port) }
    Write-Output 'ai: http://127.0.0.1:5000'
    Write-Output 'worker: running (AUTOPILOT + CommunityReplyRunner enabled)'
    Write-Output 'ngrok: http://127.0.0.1:4040 (-> http://localhost:4000)'
} catch {
    foreach ($record in $startedServices) {
        $process = Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.StartedAtTicks) {
            Stop-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    throw
}
