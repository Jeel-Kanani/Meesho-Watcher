@echo off
setlocal enabledelayedexpansion
title Meesho Watcher - One-Click Installer & Launcher
color 0A

echo ====================================================================
echo              🚀 MEESHO WATCHER AUTOMATION SETUP 🚀
echo ====================================================================
echo.

set "REPO_URL=https://github.com/Jeel-Kanani/Meesho-Watcher.git"
set "ZIP_URL=https://github.com/Jeel-Kanani/Meesho-Watcher/archive/refs/heads/main.zip"
set "TARGET_DIR=%~dp0"
cd /d "%TARGET_DIR%"

:: 1. Check Node.js installation
echo [1/5] Checking Node.js environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ Node.js is NOT installed on this PC.
    echo 📥 Attempting automatic Node.js installation via winget / PowerShell...
    
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        echo Running: winget install OpenJS.NodeJS ...
        winget install --id OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements
    ) else (
        echo 📥 Downloading Node.js Installer via PowerShell...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $url = 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi'; $out = '$env:TEMP\node_installer.msi'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process msiexec.exe -ArgumentList '/i', $out, '/qs' -Wait"
    )
    
    echo ⏳ Refreshing environment PATH...
    set "PATH=%SystemRoot%\system32;%SystemRoot%;%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
    
    where node >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ Node.js installation incomplete. Please restart command prompt or install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )
)
echo ✅ Node.js is ready:
call node -v

:: 2. Check Git installation & Code Retrieval
echo.
echo [2/5] Checking Git environment and retrieving code...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ Git is NOT installed or not recognized on this PC.
    echo 📥 Attempting to install Git via winget...
    
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    )
)

where git >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Git is ready:
    call git --version
    
    if exist ".git" (
        echo 🔄 Updating repository code (git pull)...
        call git pull origin main >nul 2>&1
    ) else (
        echo 📥 Cloning repository from %REPO_URL%...
        call git clone %REPO_URL% temp_clone
        if exist "temp_clone" (
            xcopy /E /Y /H temp_clone\* . >nul
            rd /s /q temp_clone
        )
    )
) else (
    echo ⚠️ Git not found. Downloading repository ZIP archive as fallback...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $out = '$env:TEMP\repo.zip'; Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile $out; Expand-Archive -Path $out -DestinationPath '$env:TEMP\repo_extract' -Force; Copy-Item -Path '$env:TEMP\repo_extract\Meesho-Watcher-main\*' -Destination '.' -Recurse -Force; Remove-Item -Path $out, '$env:TEMP\repo_extract' -Recurse -Force"
    echo ✅ Repository files extracted successfully.
)

:: 3. Install NPM Dependencies
echo.
echo [3/5] Installing project dependencies (npm install)...
call npm install --no-audit --no-fund

:: 4. Install Playwright Chromium Browser
echo.
echo [4/5] Setting up Playwright Chromium browser binaries...
call npx playwright install chromium

:: 5. Launch Dashboard
echo.
echo ====================================================================
echo 🎉 ALL SETUPS COMPLETE! LAUNCHING MEESHO WATCHER DASHBOARD...
echo ====================================================================
echo.
echo Opening browser dashboard at http://localhost:3000 ...
start "" "http://localhost:3000"

call npm run dashboard

pause
