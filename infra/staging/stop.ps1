$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot '.runtime/processes.json'
if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Output 'No managed staging processes recorded.'
    exit 0
}

$records = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
foreach ($record in $records) {
    $process = Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $command = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$record.ProcessId)
    if (
        $process.StartTime.ToUniversalTime().Ticks.ToString() -ne $record.StartedAtTicks -or
        $process.Path -ne $record.Executable -or
        $command.CommandLine -notlike '*node_modules/next/dist/bin/next*' -or
        $command.CommandLine -notlike ('*--port ' + $record.Port + '*')
    ) {
        throw ('Process identity changed for ' + $record.Name + '; refusing to stop it.')
    }
    Stop-Process -Id $record.ProcessId
    Write-Output ('Stopped ' + $record.Name + ' (PID ' + $record.ProcessId + ').')
}
Remove-Item -LiteralPath $statePath
