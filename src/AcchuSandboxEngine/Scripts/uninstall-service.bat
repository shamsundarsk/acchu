@echo off
REM ACCHU Sandbox Engine Service Uninstallation Script
REM Run as Administrator

echo Uninstalling ACCHU Sandbox Engine Windows Service...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Stop the service
echo Stopping ACCHU Sandbox Engine service...
sc stop AcchuSandboxEngine

if %errorLevel% equ 0 (
    echo Service stopped successfully.
    REM Wait a moment for the service to fully stop
    timeout /t 3 /nobreak >nul
) else (
    echo Service was not running or failed to stop.
)

REM Delete the service
echo Removing ACCHU Sandbox Engine service...
sc delete AcchuSandboxEngine

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS: ACCHU Sandbox Engine service uninstalled successfully!
) else (
    echo ERROR: Failed to uninstall service. It may not be installed.
)

echo.
echo Service uninstallation complete.
echo.
pause