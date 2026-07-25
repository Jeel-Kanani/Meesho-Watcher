@echo off
title Meesho Watcher Automation Dashboard
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not detected. Launching full environment setup...
    call "%~dp0Setup-And-Start-Meesho-Watcher.bat"
    exit /b
)

if not exist "node_modules" (
    echo Dependencies missing. Running one-click setup script...
    call "%~dp0Setup-And-Start-Meesho-Watcher.bat"
    exit /b
)

echo ===================================================
echo   Starting Meesho Watcher Automation Dashboard...
echo ===================================================
echo.
npm run dashboard
pause
