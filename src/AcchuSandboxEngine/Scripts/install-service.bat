@echo off
REM ACCHU Sandbox Engine Service Installation Script
REM Run as Administrator

echo Installing ACCHU Sandbox Engine Windows Service...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
set SERVICE_EXE=%SCRIPT_DIR%..\AcchuSandboxEngine.exe

REM Check if the service executable exists
if not exist "%SERVICE_EXE%" (
    echo ERROR: Service executable not found at: %SERVICE_EXE%
    echo Please ensure the application is built and the executable exists.
    pause
    exit /b 1
)

echo Service executable found: %SERVICE_EXE%
echo.

REM Stop the service if it's already running
echo Stopping existing service (if running)...
sc stop AcchuSandboxEngine >nul 2>&1

REM Delete existing service if it exists
echo Removing existing service (if exists)...
sc delete AcchuSandboxEngine >nul 2>&1

REM Install the service
echo Installing service...
sc create AcchuSandboxEngine binPath= "\"%SERVICE_EXE%\"" start= auto DisplayName= "ACCHU Sandbox Engine" depend= "Spooler"

if %errorLevel% neq 0 (
    echo ERROR: Failed to install service.
    pause
    exit /b 1
)

REM Set service description
echo Setting service description...
sc description AcchuSandboxEngine "ACCHU Sandbox Engine provides secure, ephemeral sandbox workspaces for customer document printing. The service enforces print-only access controls and guarantees automatic data destruction after session termination to protect customer privacy."

REM Configure service recovery options
echo Configuring service recovery options...
sc failure AcchuSandboxEngine reset= 86400 actions= restart/60000/restart/120000/restart/300000

REM Configure service to run as Local Service
echo Configuring service account...
sc config AcchuSandboxEngine obj= "NT AUTHORITY\LOCAL SERVICE"

REM Start the service
echo Starting service...
sc start AcchuSandboxEngine

if %errorLevel% neq 0 (
    echo WARNING: Service installed but failed to start. Check Event Log for details.
    echo You can start the service manually using: sc start AcchuSandboxEngine
) else (
    echo.
    echo SUCCESS: ACCHU Sandbox Engine service installed and started successfully!
)

echo.
echo Service installation complete.
echo.
echo To verify the service status, run: sc query AcchuSandboxEngine
echo To view service logs, check Windows Event Viewer under Application logs
echo.
pause