# -Autopilot (draft-worker only): also run the automation scheduler tick and the publishing
# outbox; what is approved/published is still decided by the workspace automation settings.
param([ValidateSet('ai','draft-worker')][string]$Component = 'ai', [switch]$InstallTask, [switch]$Autopilot)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtime = Join-Path $PSScriptRoot '.runtime'
$apiEnv = Join-Path $repo 'apps/api/.env.local'
$taskName = if ($Component -eq 'ai') { 'AI-Growth-OS AI' } else { 'AI-Growth-OS Draft Worker' }
if ($InstallTask) {
    $action = New-ScheduledTaskAction -Execute (Get-Command powershell.exe).Source -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Component ' + $Component + $(if ($Autopilot) { ' -Autopilot' } else { '' }))
    $triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Description 'Runs AI Growth OS manual draft services without automatic approval or publication.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output ('Installed and started: ' + $taskName)
    exit 0
}
if (-not (Test-Path -LiteralPath $apiEnv)) { throw 'API .env.local is required' }
foreach ($line in Get-Content -LiteralPath $apiEnv) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { Set-Item -Path ('Env:' + $Matches[1]) -Value ($Matches[2].Trim().Trim('"').Trim("'")) }
}
$env:INTERNAL_AI_AUTH_TOKEN = $env:AUTOMATION_INTERNAL_TOKEN
$env:AI_SERVICE_BASE_URL = 'http://127.0.0.1:5000'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if ($Component -eq 'ai') {
    if (Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue) {
        $health = Invoke-RestMethod 'http://127.0.0.1:5000/healthz' -TimeoutSec 5
        if ($health.status -ne 'ok') { throw 'Port 5000 is not a healthy AI service' }
        exit 0
    }
    $python = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Python/pythoncore-*/python.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $python) { throw 'Set up the Python interpreter and AI dependencies first' }
    $env:LLM_PROVIDER_MODE = 'live'; $env:LLM_MODEL = 'qwen3:4b-instruct'
    $executable = $python.FullName; $directory = $repo
    $arguments = @('-m','uvicorn','src.app.main:app','--app-dir','services/ai','--host','127.0.0.1','--port','5000')
} else {
    $null = Invoke-RestMethod 'http://127.0.0.1:5000/readyz' -TimeoutSec 10
    $executable = (Get-Command node.exe).Source; $directory = Join-Path $repo 'apps/worker'
    $arguments = @('--import','tsx','src/draft-main.ts')
    if ($Autopilot) { $env:AUTOPILOT = '1'; $env:API_BASE_URL = 'http://127.0.0.1:4000' }
}
$process = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime ($Component + '.stdout.log')) -RedirectStandardError (Join-Path $runtime ($Component + '.stderr.log'))
[pscustomobject]@{ProcessId=$process.Id;Component=$Component;StartedAt=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime ($Component + '.process.json')) -Encoding UTF8
$process.WaitForExit()
if ($process.ExitCode -ne 0) { exit 1 }
