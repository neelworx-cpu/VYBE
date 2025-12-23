# Launch VYBE IDE
# This script ensures the app launches properly

Write-Host "Launching VYBE IDE..." -ForegroundColor Cyan

# Change to project root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptPath "..")

# Check if Electron binary exists
$electronPath = ".build\electron\VYBE.exe"
if (-not (Test-Path $electronPath)) {
    Write-Host "ERROR: Electron binary not found at: $electronPath" -ForegroundColor Red
    Write-Host "Run 'npm run electron' first to download Electron." -ForegroundColor Yellow
    exit 1
}

# Set environment variables
$env:NODE_ENV = "development"
$env:VSCODE_DEV = "1"
$env:VSCODE_CLI = "1"
$env:ELECTRON_ENABLE_LOGGING = "1"

# Run preLaunch if needed
if (-not $env:VSCODE_SKIP_PRELAUNCH) {
    Write-Host "Running preLaunch script..." -ForegroundColor Gray
    node --import ./build/node/import-meta-dirname-polyfill.mjs --import tsx build/lib/preLaunch.ts
}

# Launch the app
Write-Host "Starting VYBE..." -ForegroundColor Green
Start-Process -FilePath $electronPath -ArgumentList "." -WorkingDirectory (Get-Location).Path

# Wait a moment and check if it launched
Start-Sleep -Seconds 2
$processes = Get-Process | Where-Object {$_.ProcessName -eq "VYBE"}
if ($processes) {
    $count = $processes.Count
    Write-Host "VYBE launched successfully! ($count process(es) running)" -ForegroundColor Green
    Write-Host "Check your screen for the VYBE window." -ForegroundColor Cyan
} else {
    Write-Host "VYBE process started but may have exited. Check for errors above." -ForegroundColor Yellow
}

