<#
.SYNOPSIS
    VMark Auto-Updater
    Automatically checks xiaolai/vmark releases and updates the local installation in D:\VMark.
#>

[CmdletBinding()]
param(
    [string]$Repo = "xiaolai/vmark",
    [string]$InstallDir = "D:\VMark",
    [switch]$CheckOnly,
    [switch]$Force,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    if (-not $Silent) {
        switch ($Level) {
            "ERROR" { Write-Host $line -ForegroundColor Red }
            "WARN"  { Write-Host $line -ForegroundColor Yellow }
            "SUCCESS" { Write-Host $line -ForegroundColor Green }
            default { Write-Host $line -ForegroundColor Cyan }
        }
    }
    try {
        $logPath = Join-Path $InstallDir "updater.log"
        Add-Content -Path $logPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}
}

Write-Log "Starting VMark Auto-Updater check (Upstream: $Repo, InstallDir: $InstallDir)"

# 1. Determine currently installed version
$exePath = Join-Path $InstallDir "vmark.exe"
if (-not (Test-Path $exePath)) {
    Write-Log "vmark.exe not found at $exePath!" "ERROR"
    exit 1
}

$fileVer = (Get-Item $exePath).VersionInfo.ProductVersion.Trim()
Write-Log "Current installed version: $fileVer"

# 2. Query GitHub Releases for latest release
$apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
try {
    $headers = @{
        "User-Agent" = "VMark-AutoUpdater"
        "Accept"     = "application/vnd.github.v3+json"
    }
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 30
} catch {
    Write-Log "Failed to query GitHub Releases API: $_" "ERROR"
    exit 1
}

$latestTag = $release.tag_name -replace '^v', ''
Write-Log "Latest release upstream: $latestTag"

# 3. Compare versions
function Parse-VersionString ([string]$v) {
    # Extract major.minor.patch
    if ($v -match '(\d+)\.(\d+)\.(\d+)') {
        return [version]"$($matches[1]).$($matches[2]).$($matches[3])"
    }
    return [version]"0.0.0"
}

$curV = Parse-VersionString $fileVer
$newV = Parse-VersionString $latestTag

$hasUpdate = ($newV -gt $curV)
if ($Force) { $hasUpdate = $true }

if (-not $hasUpdate) {
    Write-Log "VMark is already up to date ($fileVer)." "SUCCESS"
    if (-not $Silent) {
        Write-Host "`nVMark is up to date! Current version: $fileVer`n" -ForegroundColor Green
    }
    exit 0
}

Write-Log "New version available: $latestTag (Current: $fileVer)" "WARN"

if ($CheckOnly) {
    Write-Host "Update is available: $latestTag"
    exit 0
}

# 4. Find the Windows NSIS installer asset (*_x64-setup.exe)
$asset = $release.assets | Where-Object { $_.name -like "*_x64-setup.exe" } | Select-Object -First 1
if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
}

if (-not $asset) {
    Write-Log "No suitable Windows installer (.exe) found in release $latestTag!" "ERROR"
    exit 1
}

Write-Log "Found installer asset: $($asset.name) ($([math]::Round($asset.size / 1MB, 2)) MB)"

# 5. Download installer
$tempDir = Join-Path $env:TEMP "VMarkUpdates"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$installerPath = Join-Path $tempDir $asset.name
Write-Log "Downloading installer to $installerPath..."

try {
    # Use curl.exe if available for fast download with progress, otherwise Invoke-WebRequest
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -sL -o $installerPath $asset.browser_download_url
    } else {
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath
    }
} catch {
    Write-Log "Download failed: $_" "ERROR"
    exit 1
}

if (-not (Test-Path $installerPath) -or (Get-Item $installerPath).Length -eq 0) {
    Write-Log "Downloaded installer is missing or empty!" "ERROR"
    exit 1
}

Write-Log "Download complete. Preparing installation..." "SUCCESS"

# 6. Check if vmark is running and wait or close
$running = Get-Process -Name "vmark" -ErrorAction SilentlyContinue
if ($running) {
    Write-Log "VMark is currently running. Waiting for process to exit or closing gracefully..." "WARN"
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 7. Run silent install to $InstallDir
Write-Log "Installing update to $InstallDir..."
try {
    $proc = Start-Process -FilePath $installerPath -ArgumentList "/S", "/D=$InstallDir" -Wait -PassThru
    if ($proc.ExitCode -eq 0) {
        $updatedVer = (Get-Item $exePath).VersionInfo.ProductVersion.Trim()
        Write-Log "VMark successfully updated to $updatedVer!" "SUCCESS"

        # Clean up installer
        Remove-Item -Force $installerPath -ErrorAction SilentlyContinue

        if (-not $Silent) {
            Write-Host "`n[SUCCESS] VMark has been updated to version $updatedVer!`n" -ForegroundColor Green
        }
    } else {
        Write-Log "Installer exited with non-zero code: $($proc.ExitCode)" "ERROR"
        exit $proc.ExitCode
    }
} catch {
    Write-Log "Failed to execute installer: $_" "ERROR"
    exit 1
}
