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

    foreach ($service in $services) { Write-Output ($service.name + ': http://localhost:' + $service.port) }
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
