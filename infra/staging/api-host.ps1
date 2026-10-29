param([switch]$InstallTask)

# Serves the existing production API build. Never rebuilds, seeds, migrates,
# changes credentials, or stops a process that already owns port 4000.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$appRoot = Join-Path $repoRoot 'apps/api'
$runtimeRoot = Join-Path $PSScriptRoot '.runtime'
$taskName = 'AI-Growth-OS API'
$node = (Get-Command node.exe).Source
if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.next/BUILD_ID'))) { throw 'Build apps/api before starting the managed API host.' }
if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.env.local'))) { throw 'API .env.local is required; existing secrets will not be regenerated.' }

if ($InstallTask) {
    $powershell = (Get-Command powershell.exe).Source
    $action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
    $triggers = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
    )
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings `
        -Description 'Runs the AI Growth OS API and recovers after exit while the staging Windows host is available.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output ('Installed and started scheduled task: ' + $taskName)
    exit 0
}

if (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue) {
    $health = Invoke-RestMethod 'http://127.0.0.1:4000/v1/health' -TimeoutSec 5
    if ($health.status -ne 'ok' -or $health.service -ne 'ai-growth-os-api') { throw 'Port 4000 belongs to an unexpected service.' }
    Write-Output 'API is already healthy; leaving the existing process running.'
    exit 0
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$process = Start-Process -FilePath $node -ArgumentList @('node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4000') `
    -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimeRoot 'api.stdout.log') -RedirectStandardError (Join-Path $runtimeRoot 'api.stderr.log')
[pscustomobject]@{ ProcessId = $process.Id; Executable = $node; StartedAtTicks = $process.StartTime.ToUniversalTime().Ticks.ToString(); Port = 4000 } |
    ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $runtimeRoot 'api-host.json')
$process.WaitForExit()
if ($process.ExitCode -ne 0) { exit 1 }
