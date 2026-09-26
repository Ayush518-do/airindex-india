<#
.SYNOPSIS
    Registers (or removes) a Windows scheduled task that keeps the AIRINDEX
    scheduler running, so real scrape days keep accumulating.

.DESCRIPTION
    Starts `python -m scraper.scheduler` (windowless, via pythonw) at logon and
    again at 05:55 each day. The scheduler itself does the daily 06:00 scrapes,
    catches up a missed day, and refuses to run twice (it holds a lock), so the
    second trigger only matters if the first instance died.

    Deliberately overrides three Windows defaults that would quietly stop
    collection on a laptop:
      * "Don't start on battery" / "stop when unplugged"   -> allowed on battery
      * 72-hour execution time limit                        -> no limit
      * no retry on failure                                 -> retry 3x, 5 min apart

    Runs as you, only while you are signed in; no password is stored.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install_scheduler_task.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install_scheduler_task.ps1 -Uninstall
#>
param(
    [switch]$Uninstall,
    [string]$TaskName = "AIRINDEX Scheduler"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Pythonw = Join-Path $Repo ".venv\Scripts\pythonw.exe"
# Full account name (e.g. "PC-NAME\ayush" or "AzureAD\ayush"); a bare username is rejected on some machines.
$Me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed task '$TaskName'."
    } else {
        Write-Host "No task named '$TaskName' is registered."
    }
    exit 0
}

if (-not (Test-Path $Pythonw)) {
    throw "Virtualenv not found at $Pythonw. Create it first: python -m venv .venv; .venv\Scripts\pip install -r backend\requirements.txt"
}

$action = New-ScheduledTaskAction -Execute $Pythonw -Argument "-m scraper.scheduler" -WorkingDirectory $Repo

$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $Me),
    (New-ScheduledTaskTrigger -Daily -At "05:55")
)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $Me -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force `
    -Description "Daily airfare scrape + index pipeline for AIRINDEX INDIA ($Repo)" | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Registered and started '$TaskName'."
Write-Host "  runs:     $Pythonw -m scraper.scheduler"
Write-Host "  in:       $Repo"
Write-Host "  triggers: at logon, and daily at 05:55 (no-op if already running)"
Write-Host ""
Write-Host "Check it:   Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "Logs:       $Repo\data\logs\scheduler.jsonl"
Write-Host "Remove it:  powershell -ExecutionPolicy Bypass -File scripts\install_scheduler_task.ps1 -Uninstall"
