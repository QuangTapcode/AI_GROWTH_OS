param(
    [switch]$Run,
    [switch]$InstallTask,
    [switch]$UninstallTask,
    [switch]$SkipDnsRoute,
    [string]$TunnelName = 'aigrowthos-api',
    [string]$TunnelId,
    [string]$Hostname = 'api.growthos.vn',
    [int]$ApiPort = 4000,
    [string]$Cloudflared = (Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe'),
    [string]$TokenFile = (Join-Path $env:USERPROFILE '.cloudflared\aigrowthos-api.token')
)

# Stable Cloudflare Named Tunnel for the staging API.  The tunnel credentials
# and config stay under the user's .cloudflared directory and are never
# committed to the repository.
$ErrorActionPreference = 'Stop'
$stagingRoot = $PSScriptRoot
$runtimeRoot = Join-Path $stagingRoot '.runtime'
$runtimeState = Join-Path $runtimeRoot 'named-tunnel.json'
$originPath = Join-Path $runtimeRoot 'api-origin.txt'
$cloudDir = Join-Path $env:USERPROFILE '.cloudflared'
$configPath = Join-Path $cloudDir 'aigrowthos-api.yml'
$logPath = Join-Path $runtimeRoot 'named-tunnel.log'
$taskName = 'AI-Growth-OS Named Tunnel'

function Assert-Cloudflared {
    if (-not (Test-Path -LiteralPath $Cloudflared)) {
        throw ('cloudflared not found at ' + $Cloudflared + '.')
    }
}

function Get-TunnelList {
    $raw = & $Cloudflared tunnel list -o json 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) { return @() }
    try { return @($raw | ConvertFrom-Json) } catch { return @() }
}

function Get-TunnelId {
    $existing = Get-TunnelList | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
    if ($existing) { return [string]$existing.id }

    $output = & $Cloudflared tunnel create $TunnelName 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ('Unable to create tunnel ' + $TunnelName + ': ' + ($output -join ' '))
    }
    $match = [regex]::Match(($output -join "`n"), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
    if (-not $match.Success) { throw 'Tunnel created but UUID was not returned.' }
    return $match.Value
}

function Write-TunnelConfig([string]$TunnelId) {
    $credentialsPath = Join-Path $cloudDir ($TunnelId + '.json')
    if (-not (Test-Path -LiteralPath $credentialsPath)) {
        throw ('Missing tunnel credentials: ' + $credentialsPath)
    }
    New-Item -ItemType Directory -Path $cloudDir -Force | Out-Null
    @(
        ('tunnel: ' + $TunnelId)
        ('credentials-file: ' + ($credentialsPath -replace '\\', '/'))
        'no-autoupdate: true'
        'ingress:'
        ('  - hostname: ' + $Hostname)
        ('    service: http://127.0.0.1:' + $ApiPort)
        '  - service: http_status:404'
    ) | Set-Content -Encoding UTF8 -LiteralPath $configPath
    return $credentialsPath
}

function Get-ManagedProcess {
    if (-not (Test-Path -LiteralPath $runtimeState)) { return $null }
    $state = Get-Content -Raw -LiteralPath $runtimeState | ConvertFrom-Json
    $process = Get-Process -Id $state.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if ($process.Path -ne $Cloudflared) { return $null }
    return $process
}

Assert-Cloudflared
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

if ($UninstallTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output ('Removed scheduled task: ' + $taskName)
    exit 0
}

$hasToken = Test-Path -LiteralPath $TokenFile
if (-not $hasToken -and -not (Test-Path -LiteralPath (Join-Path $cloudDir 'cert.pem'))) {
    throw ('Cloudflare origin certificate is missing. Run cloudflared tunnel login first, then rerun this script. Expected: ' + (Join-Path $cloudDir 'cert.pem'))
}

if ($Run) {
    if (Test-Path -LiteralPath $TokenFile) {
        & $Cloudflared tunnel --no-autoupdate --logfile $logPath run --token-file $TokenFile $TunnelName
    } else {
        if (-not (Test-Path -LiteralPath $configPath)) {
            throw ('Missing config ' + $configPath + '. Run this script once without -Run after cloudflared tunnel login.')
        }
        & $Cloudflared tunnel --no-autoupdate --logfile $logPath --config $configPath run $TunnelName
    }
    exit $LASTEXITCODE
}

if (-not $TunnelId -and $hasToken -and (Test-Path -LiteralPath $runtimeState)) {
    $TunnelId = [string](Get-Content -Raw -LiteralPath $runtimeState | ConvertFrom-Json).TunnelId
}
if ($TunnelId) {
    $tunnelId = $TunnelId
} elseif ($hasToken) {
    throw 'TunnelId is required when using an API-issued tunnel token.'
} else {
    $tunnelId = Get-TunnelId
}
Set-Content -Encoding UTF8 -LiteralPath $originPath -Value ('https://' + $Hostname)
[pscustomobject]@{
    TunnelId = $tunnelId
    TunnelName = $TunnelName
    Hostname = $Hostname
    TokenFile = $TokenFile
    UpdatedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $runtimeState
$credentialsPath = $null
if (-not $hasToken) {
    $credentialsPath = Write-TunnelConfig $tunnelId
}

if (-not $SkipDnsRoute -and -not $hasToken) {
    $routeOutput = & $Cloudflared tunnel route dns $TunnelName $Hostname 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning ('Cloudflare could not create DNS route. Add this CNAME at the DNS provider for ' + $Hostname + ': ' + $tunnelId + '.cfargotunnel.com')
        Write-Warning (($routeOutput -join ' '))
    } else {
        Write-Output ($routeOutput -join "`n")
    }
}

if ($InstallTask) {
    $powershell = (Get-Command powershell.exe).Source
    $runArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Run -TunnelName "' + $TunnelName + '" -Hostname "' + $Hostname + '" -ApiPort ' + $ApiPort
    if ($TunnelId) { $runArgs += ' -TunnelId "' + $TunnelId + '"' }
    if ($hasToken) { $runArgs += ' -TokenFile "' + $TokenFile + '"' }
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $runArgs
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Keeps the AI-Growth-OS API Cloudflare Named Tunnel connected.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output ('Installed and started scheduled task: ' + $taskName)
} elseif (-not (Get-ManagedProcess)) {
    if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
    if ($hasToken) {
        $arguments = @('tunnel', '--no-autoupdate', '--logfile', $logPath, 'run', '--token-file', $TokenFile, $TunnelName)
    } else {
        $arguments = @('tunnel', '--no-autoupdate', '--logfile', $logPath, '--config', $configPath, 'run', $TunnelName)
    }
    $process = Start-Process -FilePath $Cloudflared -ArgumentList $arguments -WindowStyle Hidden -PassThru
    [pscustomobject]@{
        ProcessId = $process.Id
        TunnelId = $tunnelId
        Hostname = $Hostname
        Config = $configPath
        StartedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $runtimeState
    Write-Output ('Started named tunnel ' + $TunnelName + ' (PID ' + $process.Id + ').')
} else {
    Write-Output ('Named tunnel already running: ' + $TunnelName)
}

Write-Output ('API origin: https://' + $Hostname)
Write-Output ('Tunnel target: ' + $tunnelId + '.cfargotunnel.com')
if ($configPath -and (Test-Path -LiteralPath $configPath)) { Write-Output ('Config: ' + $configPath) }
