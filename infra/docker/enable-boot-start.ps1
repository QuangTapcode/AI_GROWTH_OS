#Requires -RunAsAdministrator
<#
  Makes the AI Growth OS server start by itself when the machine is switched on, without anyone signing in.

  Docker Desktop only runs inside a signed-in session, so this turns on Windows' own
  "Sign-in and lock last interactive user automatically after a restart" (ARSO): after a restart or a cold boot
  Windows opens the last user's session and locks it at once. Docker Desktop, the containers in
  infra/docker/compose.yaml and the draft worker task then start in that session; using the PC still needs
  the password or PIN.

  Run once, from an Administrator PowerShell, signed in as the user who runs Docker Desktop:
    powershell -ExecutionPolicy Bypass -File D:\Hoc\AI-Growth-OS\infra\docker\enable-boot-start.ps1
  Undo:
    powershell -ExecutionPolicy Bypass -File D:\Hoc\AI-Growth-OS\infra\docker\enable-boot-start.ps1 -Disable
#>
param([switch]$Disable)
$ErrorActionPreference = 'Stop'

$system = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$userArso = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\UserARSO\$sid"

if ($Disable) {
    New-ItemProperty -Path $system -Name DisableAutomaticRestartSignOn -Value 1 -PropertyType DWord -Force | Out-Null
    Remove-ItemProperty -Path $system -Name AutomaticRestartSignOnConfig -ErrorAction SilentlyContinue
    Write-Output 'Automatic sign-in and lock after restart is off.'
    exit 0
}

# 0 = ARSO on; 1 = "Always", so it also works when BitLocker is off or suspended.
New-ItemProperty -Path $system -Name DisableAutomaticRestartSignOn -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $system -Name AutomaticRestartSignOnConfig -Value 1 -PropertyType DWord -Force | Out-Null
# The per-user switch behind Settings > Accounts > Sign-in options >
# "Use my sign-in info to automatically finish setting up after an update".
New-Item -Path $userArso -Force | Out-Null
New-ItemProperty -Path $userArso -Name OptOut -Value 0 -PropertyType DWord -Force | Out-Null

$docker = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Docker Desktop' -ErrorAction SilentlyContinue
Write-Output ('Automatic sign-in and lock after restart: on for ' + [Security.Principal.WindowsIdentity]::GetCurrent().Name)
Write-Output ('Docker Desktop starts at sign-in: ' + [bool]$docker)
Write-Output 'Restart the PC once to check: it should stop at the lock screen, and the site should answer within about 3 minutes.'
