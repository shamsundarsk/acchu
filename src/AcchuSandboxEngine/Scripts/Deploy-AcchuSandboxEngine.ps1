#Requires -Version 5.1
#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Deploys the ACCHU Sandbox Engine Windows Service with comprehensive validation and configuration.

.DESCRIPTION
    This PowerShell script provides advanced deployment capabilities for the ACCHU Sandbox Engine,
    including configuration validation, security checks, service installation, and post-deployment verification.

.PARAMETER ConfigurationFile
    Path to the configuration file to use. Defaults to appsettings.json in the service directory.

.PARAMETER Environment
    Target environment (Development, Production). Affects which configuration file is used.

.PARAMETER ServiceAccount
    Service account to run the service under. Defaults to 'NT AUTHORITY\LOCAL SERVICE'.

.PARAMETER ValidateOnly
    Only validate configuration without installing the service.

.PARAMETER Force
    Force installation even if validation warnings are present.

.EXAMPLE
    .\Deploy-AcchuSandboxEngine.ps1
    Deploy with default settings

.EXAMPLE
    .\Deploy-AcchuSandboxEngine.ps1 -Environment Production -ValidateOnly
    Validate production configuration only

.EXAMPLE
    .\Deploy-AcchuSandboxEngine.ps1 -Force
    Deploy even with validation warnings
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigurationFile,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("Development", "Production")]
    [string]$Environment = "Production",
    
    [Parameter(Mandatory = $false)]
    [string]$ServiceAccount = "NT AUTHORITY\LOCAL SERVICE",
    
    [Parameter(Mandatory = $false)]
    [switch]$ValidateOnly,
    
    [Parameter(Mandatory = $false)]
    [switch]$Force
)

# Script configuration
$ServiceName = "AcchuSandboxEngine"
$ServiceDisplayName = "ACCHU Sandbox Engine"
$ServiceDescription = "ACCHU Sandbox Engine provides secure, ephemeral sandbox workspaces for customer document printing. The service enforces print-only access controls and guarantees automatic data destruction after session termination to protect customer privacy."

# Get script directory and service paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceExe = Join-Path (Split-Path -Parent $ScriptDir) "AcchuSandboxEngine.exe"
$ServiceDir = Split-Path -Parent $ServiceExe

# Determine configuration file
if (-not $ConfigurationFile) {
    if ($Environment -eq "Production") {
        $ConfigurationFile = Join-Path $ServiceDir "appsettings.Production.json"
        if (-not (Test-Path $ConfigurationFile)) {
            $ConfigurationFile = Join-Path $ServiceDir "appsettings.json"
        }
    } else {
        $ConfigurationFile = Join-Path $ServiceDir "appsettings.Development.json"
        if (-not (Test-Path $ConfigurationFile)) {
            $ConfigurationFile = Join-Path $ServiceDir "appsettings.json"
        }
    }
}

# Logging functions
function Write-Header {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Yellow
    Write-Host ("=" * $Message.Length) -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "WARNING: $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
}

# Validation functions
function Test-Prerequisites {
    Write-Step "Checking Prerequisites"
    
    $issues = @()
    
    # Check if running as administrator
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $issues += "Script must be run as Administrator"
    }
    
    # Check service executable
    if (-not (Test-Path $ServiceExe)) {
        $issues += "Service executable not found: $ServiceExe"
    }
    
    # Check configuration file
    if (-not (Test-Path $ConfigurationFile)) {
        $issues += "Configuration file not found: $ConfigurationFile"
    }
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $issues += "PowerShell 5.1 or later is required"
    }
    
    # Check Windows version
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -lt 10) {
        Write-Warning "Windows 10 or later is recommended for optimal security features"
    }
    
    if ($issues.Count -gt 0) {
        Write-Error "Prerequisites check failed:"
        $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        return $false
    }
    
    Write-Success "Prerequisites check passed"
    return $true
}

function Test-Configuration {
    Write-Step "Validating Configuration"
    
    try {
        # Run built-in configuration validation
        $validationResult = & $ServiceExe --validate-config 2>&1
        $validationExitCode = $LASTEXITCODE
        
        if ($validationExitCode -eq 0) {
            Write-Success "Configuration validation passed"
            return $true
        } else {
            Write-Error "Configuration validation failed"
            Write-Host $validationResult -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Error "Could not run configuration validation: $($_.Exception.Message)"
        return $false
    }
}

function Test-SystemRequirements {
    Write-Step "Checking System Requirements"
    
    $warnings = @()
    
    # Check Print Spooler service
    try {
        $spoolerService = Get-Service -Name "Spooler" -ErrorAction Stop
        if ($spoolerService.Status -ne "Running") {
            $warnings += "Print Spooler service is not running"
        } else {
            Write-Success "Print Spooler service is running"
        }
    }
    catch {
        $warnings += "Could not check Print Spooler service status"
    }
    
    # Check disk space
    try {
        $tempPath = [System.Environment]::ExpandEnvironmentVariables("%TEMP%")
        $drive = Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DeviceID -eq (Split-Path -Qualifier $tempPath) }
        $freeSpaceGB = [math]::Round($drive.FreeSpace / 1GB, 2)
        
        if ($freeSpaceGB -lt 1) {
            $warnings += "Low disk space: ${freeSpaceGB}GB available"
        } elseif ($freeSpaceGB -lt 5) {
            Write-Warning "Disk space is getting low: ${freeSpaceGB}GB available"
        } else {
            Write-Success "Sufficient disk space available: ${freeSpaceGB}GB"
        }
    }
    catch {
        $warnings += "Could not check disk space"
    }
    
    # Check .NET runtime
    try {
        $dotnetVersion = & dotnet --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success ".NET runtime is available: $dotnetVersion"
        } else {
            $warnings += ".NET runtime may not be properly installed"
        }
    }
    catch {
        $warnings += "Could not verify .NET runtime installation"
    }
    
    if ($warnings.Count -gt 0) {
        Write-Warning "System requirements check found issues:"
        $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        
        if (-not $Force) {
            $continue = Read-Host "Continue with deployment? (y/N)"
            if ($continue -ne "y" -and $continue -ne "Y") {
                return $false
            }
        }
    }
    
    return $true
}

function Install-Service {
    Write-Step "Installing Service"
    
    try {
        # Stop existing service if running
        $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Write-Host "Stopping existing service..."
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 5
        }
        
        # Remove existing service
        if ($existingService) {
            Write-Host "Removing existing service..."
            & sc.exe delete $ServiceName | Out-Null
            Start-Sleep -Seconds 2
        }
        
        # Install new service
        Write-Host "Installing service..."
        $installResult = & sc.exe create $ServiceName binPath= "`"$ServiceExe`"" start= auto DisplayName= $ServiceDisplayName depend= "Spooler"
        
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install service: $installResult"
        }
        
        # Set service description
        & sc.exe description $ServiceName $ServiceDescription | Out-Null
        
        # Configure service recovery
        & sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/120000/restart/300000 | Out-Null
        
        # Configure service account
        if ($ServiceAccount -ne "LocalSystem") {
            Write-Host "Configuring service account: $ServiceAccount"
            & sc.exe config $ServiceName obj= $ServiceAccount | Out-Null
        }
        
        # Set delayed start
        & sc.exe config $ServiceName start= delayed-auto | Out-Null
        
        Write-Success "Service installed successfully"
        return $true
    }
    catch {
        Write-Error "Service installation failed: $($_.Exception.Message)"
        return $false
    }
}

function Initialize-Directories {
    Write-Step "Initializing Directories"
    
    try {
        # Create sandbox temp directory
        $sandboxTempDir = [System.Environment]::ExpandEnvironmentVariables("%TEMP%\AcchuSandbox")
        if (-not (Test-Path $sandboxTempDir)) {
            New-Item -ItemType Directory -Path $sandboxTempDir -Force | Out-Null
            Write-Success "Created sandbox temp directory: $sandboxTempDir"
        }
        
        # Create security log directory
        $securityLogDir = [System.Environment]::ExpandEnvironmentVariables("%TEMP%\AcchuSandbox\SecurityLogs")
        if (-not (Test-Path $securityLogDir)) {
            New-Item -ItemType Directory -Path $securityLogDir -Force | Out-Null
            Write-Success "Created security log directory: $securityLogDir"
        }
        
        # Create service log directory
        $serviceLogDir = [System.Environment]::ExpandEnvironmentVariables("%TEMP%\AcchuSandbox\Logs")
        if (-not (Test-Path $serviceLogDir)) {
            New-Item -ItemType Directory -Path $serviceLogDir -Force | Out-Null
            Write-Success "Created service log directory: $serviceLogDir"
        }
        
        # Set appropriate permissions
        Write-Host "Setting directory permissions..."
        & icacls $sandboxTempDir /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T | Out-Null
        & icacls $securityLogDir /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T | Out-Null
        & icacls $serviceLogDir /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T | Out-Null
        
        return $true
    }
    catch {
        Write-Error "Directory initialization failed: $($_.Exception.Message)"
        return $false
    }
}

function Start-ServiceWithValidation {
    Write-Step "Starting Service"
    
    try {
        Write-Host "Starting service..."
        Start-Service -Name $ServiceName -ErrorAction Stop
        
        # Wait for service to initialize
        Write-Host "Waiting for service to initialize..."
        Start-Sleep -Seconds 10
        
        # Check service status
        $service = Get-Service -Name $ServiceName
        if ($service.Status -eq "Running") {
            Write-Success "Service started successfully"
            
            # Test health endpoint
            Write-Host "Testing service health endpoint..."
            Start-Sleep -Seconds 5
            
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 10 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    Write-Success "Service health endpoint is responding"
                } else {
                    Write-Warning "Service health endpoint returned status: $($response.StatusCode)"
                }
            }
            catch {
                Write-Warning "Service health endpoint is not responding (this may be normal during startup)"
            }
            
            return $true
        } else {
            Write-Error "Service failed to start. Status: $($service.Status)"
            return $false
        }
    }
    catch {
        Write-Error "Failed to start service: $($_.Exception.Message)"
        Write-Host "Check Windows Event Log for detailed error information" -ForegroundColor Yellow
        return $false
    }
}

function Show-DeploymentSummary {
    Write-Header "Deployment Summary"
    
    Write-Host "Service Information:" -ForegroundColor Cyan
    Write-Host "  Name: $ServiceName"
    Write-Host "  Display Name: $ServiceDisplayName"
    Write-Host "  Executable: $ServiceExe"
    Write-Host "  Configuration: $ConfigurationFile"
    Write-Host "  Environment: $Environment"
    Write-Host "  Service Account: $ServiceAccount"
    
    Write-Host "`nDirectories:" -ForegroundColor Cyan
    Write-Host "  Sandbox Temp: %TEMP%\AcchuSandbox"
    Write-Host "  Security Logs: %TEMP%\AcchuSandbox\SecurityLogs"
    Write-Host "  Service Logs: %TEMP%\AcchuSandbox\Logs"
    
    Write-Host "`nUseful Commands:" -ForegroundColor Cyan
    Write-Host "  Check status: Get-Service -Name $ServiceName"
    Write-Host "  Start service: Start-Service -Name $ServiceName"
    Write-Host "  Stop service: Stop-Service -Name $ServiceName"
    Write-Host "  View logs: Get-EventLog -LogName Application -Source 'ACCHU Sandbox Engine'"
    Write-Host "  Test config: & '$ServiceExe' --validate-config"
    Write-Host "  Health check: Invoke-WebRequest -Uri 'http://localhost:8080/health'"
}

# Main deployment logic
function Start-Deployment {
    Write-Header "ACCHU Sandbox Engine Deployment"
    
    Write-Host "Deployment Configuration:" -ForegroundColor Cyan
    Write-Host "  Service Executable: $ServiceExe"
    Write-Host "  Configuration File: $ConfigurationFile"
    Write-Host "  Environment: $Environment"
    Write-Host "  Service Account: $ServiceAccount"
    Write-Host "  Validate Only: $ValidateOnly"
    Write-Host "  Force: $Force"
    
    # Step 1: Check prerequisites
    if (-not (Test-Prerequisites)) {
        Write-Error "Prerequisites check failed. Deployment aborted."
        exit 1
    }
    
    # Step 2: Validate configuration
    if (-not (Test-Configuration)) {
        Write-Error "Configuration validation failed. Deployment aborted."
        exit 1
    }
    
    # Step 3: Check system requirements
    if (-not (Test-SystemRequirements)) {
        Write-Error "System requirements check failed. Deployment aborted."
        exit 1
    }
    
    if ($ValidateOnly) {
        Write-Success "Validation completed successfully. Service is ready for deployment."
        return
    }
    
    # Step 4: Install service
    if (-not (Install-Service)) {
        Write-Error "Service installation failed. Deployment aborted."
        exit 1
    }
    
    # Step 5: Initialize directories
    if (-not (Initialize-Directories)) {
        Write-Error "Directory initialization failed. Deployment aborted."
        exit 1
    }
    
    # Step 6: Start service
    if (-not (Start-ServiceWithValidation)) {
        Write-Error "Service startup failed. Check Event Log for details."
        exit 1
    }
    
    # Step 7: Show summary
    Show-DeploymentSummary
    
    Write-Success "`nDeployment completed successfully!"
    
    # Offer to open Event Viewer
    $openEventLog = Read-Host "`nOpen Event Viewer to check for any startup issues? (y/N)"
    if ($openEventLog -eq "y" -or $openEventLog -eq "Y") {
        Start-Process "eventvwr.msc"
    }
}

# Execute deployment
try {
    Start-Deployment
}
catch {
    Write-Error "Deployment failed with unexpected error: $($_.Exception.Message)"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}