<#
.SYNOPSIS
    Register VMark Auto-Updater as a Windows Scheduled Task.
#>

param(
    [string]$TaskName = "VMarkAutoUpdater",
    [string]$ScriptPath = "D:\VMark\auto-updater.ps1"
)

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Silent"

# Trigger 1: At Logon
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Trigger 2: Repeating every 4 hours indefinitely
$triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 4)

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

try {
    # Unregister existing task if any
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerLogon, $triggerRepeat) -Settings $settings -Description "Automatically checks xiaolai/vmark releases and updates VMark in D:\VMark"
    Write-Host "Successfully registered scheduled task: $TaskName" -ForegroundColor Green
    Write-Host "VMark will now check for updates every 4 hours and automatically apply them." -ForegroundColor Green
} catch {
    Write-Error "Failed to register scheduled task: $_"
}
