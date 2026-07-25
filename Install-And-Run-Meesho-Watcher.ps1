# Meesho Watcher One-Click Installer & Launcher for PowerShell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     🚀 MEESHO WATCHER POWERSHELL SETUP & LAUNCHER 🚀" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$repoUrl = "https://github.com/Jeel-Kanani/Meesho-Watcher.git"
$zipUrl  = "https://github.com/Jeel-Kanani/Meesho-Watcher/archive/refs/heads/main.zip"
$workDir = $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($workDir)) {
    $workDir = Get-Location
}
Set-Location $workDir

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️ Node.js is NOT installed. Installing Node.js via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "📥 Downloading Node.js Installer..." -ForegroundColor Yellow
        $msiPath = "$env:TEMP\node_installer.msi"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi" -OutFile $msiPath
        Start-Process msiexec.exe -ArgumentList "/i", $msiPath, "/qs" -Wait
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 2. Check Git / Code
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "✅ Git detected." -ForegroundColor Green
    if (Test-Path ".git") {
        Write-Host "🔄 Updating repository code (git pull)..." -ForegroundColor Cyan
        git pull origin main
    } else {
        Write-Host "📥 Cloning repository $repoUrl ..." -ForegroundColor Cyan
        git clone $repoUrl .
    }
} else {
    Write-Host "⚠️ Git not found. Downloading repository ZIP archive..." -ForegroundColor Yellow
    $zipPath = "$env:TEMP\repo.zip"
    $extractPath = "$env:TEMP\repo_extract"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    Copy-Item -Path "$extractPath\Meesho-Watcher-main\*" -Destination "." -Recurse -Force
    Remove-Item -Path $zipPath, $extractPath -Recurse -Force
    Write-Host "✅ Repository files extracted successfully." -ForegroundColor Green
}

# 3. Install Dependencies
Write-Host "📦 Installing NPM packages..." -ForegroundColor Cyan
npm install --no-audit --no-fund

# 4. Install Playwright Browsers
Write-Host "🌐 Installing Playwright Chromium browser..." -ForegroundColor Cyan
npx playwright install chromium

# 5. Launch
Write-Host "🎉 Setup complete! Launching dashboard..." -ForegroundColor Green
Start-Process "http://localhost:3000"
npm run dashboard
