param(
  [string]$Time = "02:00"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$script = Join-Path $root "scripts\nightly.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "HermesDesktopFuzzerNightly" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered HermesDesktopFuzzerNightly at $Time. The machine must stay logged in with a desktop session."
