@echo off
echo ========================================
echo ACCHU Fixed System Installation
echo ========================================
echo.

REM Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/2] Installing Sandbox Engine...
cd SandboxEngine

REM Check if Scripts directory exists
if not exist "Scripts" (
    echo ERROR: Scripts directory not found
    echo Current directory: %CD%
    dir
    pause
    exit /b 1
)

REM Check if install-service.bat exists
if not exist "Scripts\install-service.bat" (
    echo ERROR: install-service.bat not found in Scripts directory
    echo Contents of Scripts directory:
    dir Scripts\
    pause
    exit /b 1
)

echo Found install-service.bat, executing...
call Scripts\install-service.bat
if %errorLevel% neq 0 (
    echo ERROR: Failed to install Sandbox Engine
    pause
    exit /b 1
)
cd ..

echo [2/2] System validation...
timeout /t 3 /nobreak > nul
powershell -Command "try { Invoke-RestMethod -Uri 'http://localhost:8080/api/health' -Method GET -TimeoutSec 5 | Out-Host; Write-Host 'SUCCESS: Sandbox Engine is running' } catch { Write-Host 'WARNING: Sandbox Engine may not be running yet' }"

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo The Sandbox Engine should now be running as a Windows service.
echo You can check the service status with: sc query AcchuSandboxEngine
echo.
echo Access Points:
echo - API Health Check: http://localhost:8080/api/health
echo - Download Asset Bundle: http://localhost:8080/api/integration/download/sandbox
echo.
echo Press any key to exit...
pause > nul