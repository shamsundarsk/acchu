@echo off
REM ACCHU Sandbox Engine Deployment Script
REM This script handles complete deployment including configuration validation
REM Run as Administrator

setlocal enabledelayedexpansion

echo ========================================
echo ACCHU Sandbox Engine Deployment Script
echo ========================================
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
set CONFIG_FILE=%SCRIPT_DIR%..\appsettings.json
set PROD_CONFIG_FILE=%SCRIPT_DIR%..\appsettings.Production.json

echo Deployment Configuration:
echo - Script Directory: %SCRIPT_DIR%
echo - Service Executable: %SERVICE_EXE%
echo - Configuration File: %CONFIG_FILE%
echo.

REM Check if the service executable exists
if not exist "%SERVICE_EXE%" (
    echo ERROR: Service executable not found at: %SERVICE_EXE%
    echo Please ensure the application is built and the executable exists.
    echo.
    echo Build the application using:
    echo   dotnet build --configuration Release
    echo   dotnet publish --configuration Release --output [output-directory]
    pause
    exit /b 1
)

REM Check configuration files
if not exist "%CONFIG_FILE%" (
    echo ERROR: Configuration file not found at: %CONFIG_FILE%
    pause
    exit /b 1
)

echo Step 1: Validating Configuration...
echo =====================================

REM Run configuration validation
echo Running configuration validation...
"%SERVICE_EXE%" --validate-config
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Configuration validation failed.
    echo Please review the configuration errors above and fix them before deployment.
    echo.
    echo Common issues:
    echo - JWT secret key not changed from default
    echo - Invalid file paths or permissions
    echo - Missing required configuration values
    echo.
    pause
    exit /b 1
)

echo Configuration validation passed successfully.
echo.

echo Step 2: Pre-deployment Checks...
echo =================================

REM Check if Print Spooler is running
echo Checking Print Spooler service...
sc query Spooler | find "RUNNING" >nul
if %errorLevel% neq 0 (
    echo WARNING: Print Spooler service is not running.
    echo The service may not function properly without Print Spooler.
    echo.
    set /p CONTINUE="Continue anyway? (y/N): "
    if /i not "!CONTINUE!"=="y" (
        echo Deployment cancelled.
        pause
        exit /b 1
    )
)

REM Check available disk space
echo Checking available disk space...
for /f "tokens=3" %%a in ('dir /-c %TEMP% ^| find "bytes free"') do set FREESPACE=%%a
if %FREESPACE% LSS 1073741824 (
    echo WARNING: Low disk space detected (less than 1GB free).
    echo This may affect sandbox operations.
    echo.
)

echo Step 3: Service Installation...
echo ===============================

REM Stop existing service if running
echo Stopping existing service (if running)...
sc stop AcchuSandboxEngine >nul 2>&1
if %errorLevel% equ 0 (
    echo Waiting for service to stop...
    timeout /t 5 /nobreak >nul
)

REM Delete existing service if it exists
echo Removing existing service (if exists)...
sc delete AcchuSandboxEngine >nul 2>&1

REM Install the service
echo Installing service...
sc create AcchuSandboxEngine binPath= "\"%SERVICE_EXE%\"" start= auto DisplayName= "ACCHU Sandbox Engine" depend= "Spooler"

if %errorLevel% neq 0 (
    echo ERROR: Failed to install service.
    echo.
    echo Possible causes:
    echo - Insufficient privileges
    echo - Service executable is locked or in use
    echo - Invalid executable path
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

REM Set service startup type to automatic (delayed start)
echo Configuring delayed start...
sc config AcchuSandboxEngine start= delayed-auto

echo Step 4: Security Configuration...
echo ==================================

REM Create security log directory
echo Creating security log directories...
set SECURITY_LOG_DIR=%TEMP%\AcchuSandbox\SecurityLogs
if not exist "%SECURITY_LOG_DIR%" (
    mkdir "%SECURITY_LOG_DIR%" 2>nul
    if %errorLevel% equ 0 (
        echo Created security log directory: %SECURITY_LOG_DIR%
    ) else (
        echo WARNING: Could not create security log directory: %SECURITY_LOG_DIR%
    )
)

REM Create sandbox temp directory
set SANDBOX_TEMP_DIR=%TEMP%\AcchuSandbox
if not exist "%SANDBOX_TEMP_DIR%" (
    mkdir "%SANDBOX_TEMP_DIR%" 2>nul
    if %errorLevel% equ 0 (
        echo Created sandbox temp directory: %SANDBOX_TEMP_DIR%
    ) else (
        echo WARNING: Could not create sandbox temp directory: %SANDBOX_TEMP_DIR%
    )
)

REM Set appropriate permissions on directories
echo Setting directory permissions...
icacls "%SANDBOX_TEMP_DIR%" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T >nul 2>&1
icacls "%SECURITY_LOG_DIR%" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T >nul 2>&1

echo Step 5: Service Startup...
echo ==========================

REM Start the service
echo Starting service...
sc start AcchuSandboxEngine

if %errorLevel% neq 0 (
    echo WARNING: Service installed but failed to start.
    echo.
    echo Troubleshooting steps:
    echo 1. Check Windows Event Log (Application) for error details
    echo 2. Verify configuration file is valid
    echo 3. Ensure all dependencies are available
    echo 4. Check service account permissions
    echo.
    echo You can start the service manually using: sc start AcchuSandboxEngine
    echo Or check service status using: sc query AcchuSandboxEngine
) else (
    echo.
    echo Waiting for service to initialize...
    timeout /t 10 /nobreak >nul
    
    REM Check service status
    sc query AcchuSandboxEngine | find "RUNNING" >nul
    if %errorLevel% equ 0 (
        echo SUCCESS: ACCHU Sandbox Engine service deployed and started successfully!
    ) else (
        echo WARNING: Service may not have started properly. Check Event Log for details.
    )
)

echo.
echo Step 6: Post-Deployment Verification...
echo ========================================

REM Test API endpoint if available
echo Testing service health endpoint...
timeout /t 5 /nobreak >nul
curl -s http://localhost:8080/health >nul 2>&1
if %errorLevel% equ 0 (
    echo Service health endpoint is responding.
) else (
    echo Service health endpoint is not responding (this may be normal during startup).
)

echo.
echo Deployment Summary:
echo ===================
echo - Service Name: AcchuSandboxEngine
echo - Display Name: ACCHU Sandbox Engine
echo - Status: Check with 'sc query AcchuSandboxEngine'
echo - Logs: Windows Event Viewer ^> Application
echo - Config: %CONFIG_FILE%
echo - Temp Dir: %SANDBOX_TEMP_DIR%
echo - Security Logs: %SECURITY_LOG_DIR%
echo.
echo Useful Commands:
echo - Check status: sc query AcchuSandboxEngine
echo - Start service: sc start AcchuSandboxEngine
echo - Stop service: sc stop AcchuSandboxEngine
echo - View logs: eventvwr.msc (Application log)
echo - Test config: "%SERVICE_EXE%" --validate-config
echo.

REM Check for any warnings or issues
set /p OPEN_EVENTLOG="Open Event Viewer to check for any startup issues? (y/N): "
if /i "!OPEN_EVENTLOG!"=="y" (
    start eventvwr.msc
)

echo.
echo Deployment completed. Please verify the service is running correctly.
pause