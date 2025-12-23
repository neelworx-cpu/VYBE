@echo off
REM Cross-platform setup script for VYBE extensions (Windows)
REM This script ensures all VYBE extensions are properly set up

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

echo 🚀 Setting up VYBE extensions...

REM Check Node version
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js version: %NODE_VERSION%

REM Verify VYBE contribution files exist
echo.
echo 📦 Verifying VYBE extension files...

set "VYBE_CHAT_CONTRIB=%ROOT_DIR%\src\vs\workbench\contrib\vybeChat\browser\contribution\vybeChat.contribution.ts"
set "VYBE_SETTINGS_CONTRIB=%ROOT_DIR%\src\vs\workbench\contrib\vybeSettings\browser\vybeSettings.contribution.ts"
set "VYBE_INDEXING_CONTRIB=%ROOT_DIR%\src\vs\workbench\contrib\indexing\browser\indexing.contribution.ts"

if not exist "%VYBE_CHAT_CONTRIB%" (
    echo ❌ VYBE Chat contribution file not found: %VYBE_CHAT_CONTRIB%
    exit /b 1
)
echo ✅ VYBE Chat contribution found

if not exist "%VYBE_SETTINGS_CONTRIB%" (
    echo ❌ VYBE Settings contribution file not found: %VYBE_SETTINGS_CONTRIB%
    exit /b 1
)
echo ✅ VYBE Settings contribution found

if not exist "%VYBE_INDEXING_CONTRIB%" (
    echo ❌ VYBE Indexing contribution file not found: %VYBE_INDEXING_CONTRIB%
    exit /b 1
)
echo ✅ VYBE Indexing contribution found

REM Check main import
set "MAIN_FILE=%ROOT_DIR%\src\vs\workbench\workbench.common.main.ts"
findstr /C:"vybeChat" /C:"vybeSettings" /C:"indexing" "%MAIN_FILE%" >nul
if %errorlevel% equ 0 (
    echo ✅ All VYBE extensions imported in workbench.common.main.ts
) else (
    echo ⚠️  Warning: Some VYBE extensions may not be imported in workbench.common.main.ts
)

echo.
echo ✅ VYBE extensions setup complete!
echo.
echo Next steps:
echo   1. Run: npm install
echo   2. Run: npm run compile
echo   3. Launch: .\scripts\code.bat

endlocal

