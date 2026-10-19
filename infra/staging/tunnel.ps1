param(
    [switch]$Stop,
    [string]$Cloudflared = (Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe'),
    [int]$ApiPort = 4000
)

# Cloudflare quick tunnel (trycloudflare.com) tới API local để Pages Function proxy /v1/* gọi được.
# URL đổi mỗi lần tunnel khởi động lại; chạy lại cloudflare-pages/deploy.ps1 sau khi URL đổi.
# Không cần tài khoản/domain; không có SLA — chỉ dùng cho staging/pilot.

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $PSScriptRoot '.runtime'
$statePath = Join-Path $runtimeRoot 'tunnel.json'
$logPath = Join-Path $runtimeRoot 'tunnel.log'

function Get-TunnelProcess($state) {
    $process = Get-Process -Id $state.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.StartedAtTicks -or $process.Path -ne $state.Executable) {
        return $null
    }
    return $process
}

$state = if (Test-Path -LiteralPath $statePath) { Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json } else { $null }

if ($Stop) {
    if ($state -and (Get-TunnelProcess $state)) {
        Stop-Process -Id $state.ProcessId
        Write-Output ('Stopped tunnel (PID ' + $state.ProcessId + ').')
    } else {
        Write-Output 'No managed tunnel running.'
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    exit 0
}

if ($state -and (Get-TunnelProcess $state)) {
    Write-Output $state.Url
    exit 0
}

if (-not (Test-Path -LiteralPath $Cloudflared)) {
    throw ('cloudflared not found at ' + $Cloudflared + '. Download it from https://github.com/cloudflare/cloudflared/releases.')
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath }
$arguments = @('tunnel', '--no-autoupdate', '--url', ('http://127.0.0.1:' + $ApiPort), '--logfile', $logPath)
$process = Start-Process -FilePath $Cloudflared -ArgumentList $arguments -WindowStyle Hidden -PassThru

$deadline = (Get-Date).AddSeconds(60)
$url = $null
do {
    Start-Sleep -Milliseconds 500
    if (Test-Path -LiteralPath $logPath) {
        $match = Select-String -LiteralPath $logPath -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($match) { $url = $match.Matches[0].Value }
    }
} while (-not $url -and (Get-Date) -lt $deadline -and -not $process.HasExited)

if (-not $url) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id }
    throw ('Tunnel did not report a URL. See ' + $logPath)
}

[pscustomobject]@{
    ProcessId = $process.Id
    StartedAtTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
    Executable = $Cloudflared
    Url = $url
} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $statePath

Write-Output $url
