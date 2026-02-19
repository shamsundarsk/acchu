#Requires -Version 5.1

<#
.SYNOPSIS
    Validates ACCHU Sandbox Engine configuration files.

.DESCRIPTION
    This script provides basic configuration validation for the ACCHU Sandbox Engine
    without requiring the full service executable. It checks JSON syntax, required
    sections, and common configuration issues.

.PARAMETER ConfigFile
    Path to the configuration file to validate. Defaults to appsettings.json.

.PARAMETER Environment
    Environment to validate (Development, Production). Affects which config file is used.

.PARAMETER Detailed
    Show detailed validation information including all checks performed.

.EXAMPLE
    .\validate-config.ps1
    Validate default appsettings.json

.EXAMPLE
    .\validate-config.ps1 -Environment Production -Detailed
    Validate production configuration with detailed output
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("Development", "Production")]
    [string]$Environment,
    
    [Parameter(Mandatory = $false)]
    [switch]$Detailed
)

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceDir = Split-Path -Parent $ScriptDir

# Determine configuration file
if (-not $ConfigFile) {
    if ($Environment) {
        $ConfigFile = Join-Path $ServiceDir "appsettings.$Environment.json"
        if (-not (Test-Path $ConfigFile)) {
            $ConfigFile = Join-Path $ServiceDir "appsettings.json"
        }
    } else {
        $ConfigFile = Join-Path $ServiceDir "appsettings.json"
    }
}

# Validation results
$ValidationResults = @{
    Errors = @()
    Warnings = @()
    Info = @()
    IsValid = $true
}

function Add-ValidationError {
    param([string]$Section, [string]$Message)
    $ValidationResults.Errors += @{ Section = $Section; Message = $Message }
    $ValidationResults.IsValid = $false
}

function Add-ValidationWarning {
    param([string]$Section, [string]$Message)
    $ValidationResults.Warnings += @{ Section = $Section; Message = $Message }
}

function Add-ValidationInfo {
    param([string]$Section, [string]$Message)
    $ValidationResults.Info += @{ Section = $Section; Message = $Message }
}

function Test-JsonSyntax {
    param([string]$FilePath)
    
    if ($Detailed) { Write-Host "Checking JSON syntax..." -ForegroundColor Cyan }
    
    try {
        $content = Get-Content $FilePath -Raw
        $json = $content | ConvertFrom-Json
        Add-ValidationInfo "JSON" "Syntax is valid"
        return $json
    }
    catch {
        Add-ValidationError "JSON" "Invalid JSON syntax: $($_.Exception.Message)"
        return $null
    }
}

function Test-RequiredSections {
    param($Config)
    
    if ($Detailed) { Write-Host "Checking required configuration sections..." -ForegroundColor Cyan }
    
    $requiredSections = @("Logging", "Api", "Sandbox", "Print", "Security")
    
    foreach ($section in $requiredSections) {
        if (-not $Config.$section) {
            Add-ValidationError "Structure" "Missing required section: $section"
        } else {
            if ($Detailed) { Add-ValidationInfo "Structure" "Found required section: $section" }
        }
    }
}

function Test-SecurityConfiguration {
    param($Config)
    
    if ($Detailed) { Write-Host "Validating security configuration..." -ForegroundColor Cyan }
    
    $security = $Config.Security
    if (-not $security) { return }
    
    # JWT Secret Key
    if (-not $security.JwtSecretKey) {
        Add-ValidationError "Security.JwtSecretKey" "JWT secret key is required"
    } elseif ($security.JwtSecretKey -match "CHANGE-THIS|PRODUCTION-KEY|DEFAULT") {
        Add-ValidationError "Security.JwtSecretKey" "JWT secret key must be changed from default value"
    } elseif ($security.JwtSecretKey.Length -lt 32) {
        Add-ValidationError "Security.JwtSecretKey" "JWT secret key must be at least 32 characters"
    } else {
        Add-ValidationInfo "Security.JwtSecretKey" "JWT secret key appears to be properly configured"
    }
    
    # JWT Issuer
    if (-not $security.JwtIssuer) {
        Add-ValidationError "Security.JwtIssuer" "JWT issuer is required"
    }
    
    # JWT Audience
    if (-not $security.JwtAudience) {
        Add-ValidationError "Security.JwtAudience" "JWT audience is required"
    }
    
    # Token Expiration
    if ($security.TokenExpirationMinutes -le 0) {
        Add-ValidationError "Security.TokenExpirationMinutes" "Token expiration must be greater than 0"
    } elseif ($security.TokenExpirationMinutes -gt 1440) {
        Add-ValidationWarning "Security.TokenExpirationMinutes" "Long token expiration may pose security risk"
    }
    
    # Expected File Source
    if (-not $security.ExpectedFileSource) {
        Add-ValidationError "Security.ExpectedFileSource" "Expected file source is required"
    }
    
    # Allowed Actions
    if (-not $security.AllowedActions -or $security.AllowedActions.Count -eq 0) {
        Add-ValidationError "Security.AllowedActions" "At least one action must be allowed"
    }
}

function Test-SandboxConfiguration {
    param($Config)
    
    if ($Detailed) { Write-Host "Validating sandbox configuration..." -ForegroundColor Cyan }
    
    $sandbox = $Config.Sandbox
    if (-not $sandbox) { return }
    
    # Temp Directory Root
    if (-not $sandbox.TempDirectoryRoot) {
        Add-ValidationError "Sandbox.TempDirectoryRoot" "Temp directory root is required"
    } else {
        try {
            $expandedPath = [System.Environment]::ExpandEnvironmentVariables($sandbox.TempDirectoryRoot)
            $parentDir = Split-Path -Parent $expandedPath
            
            if ($parentDir -and (Test-Path $parentDir)) {
                Add-ValidationInfo "Sandbox.TempDirectoryRoot" "Parent directory exists and is accessible"
            } else {
                Add-ValidationWarning "Sandbox.TempDirectoryRoot" "Parent directory may not exist: $parentDir"
            }
        }
        catch {
            Add-ValidationError "Sandbox.TempDirectoryRoot" "Invalid path format: $($_.Exception.Message)"
        }
    }
    
    # Session Duration
    if ($sandbox.MaxSessionDurationMinutes -le 0) {
        Add-ValidationError "Sandbox.MaxSessionDurationMinutes" "Session duration must be greater than 0"
    } elseif ($sandbox.MaxSessionDurationMinutes -gt 1440) {
        Add-ValidationWarning "Sandbox.MaxSessionDurationMinutes" "Session duration exceeds 24 hours"
    }
    
    # File Size
    if ($sandbox.MaxFileSizeBytes -le 0) {
        Add-ValidationError "Sandbox.MaxFileSizeBytes" "Max file size must be greater than 0"
    } elseif ($sandbox.MaxFileSizeBytes -gt 1073741824) {
        Add-ValidationWarning "Sandbox.MaxFileSizeBytes" "Max file size exceeds 1GB"
    }
    
    # Allowed File Types
    if (-not $sandbox.AllowedFileTypes -or $sandbox.AllowedFileTypes.Count -eq 0) {
        Add-ValidationError "Sandbox.AllowedFileTypes" "At least one file type must be allowed"
    } else {
        foreach ($fileType in $sandbox.AllowedFileTypes) {
            if (-not $fileType.StartsWith(".") -or $fileType.Length -lt 2) {
                Add-ValidationError "Sandbox.AllowedFileTypes" "Invalid file type format: $fileType"
            }
        }
    }
    
    # Secure Deletion Passes
    if ($sandbox.SecureDeletionPasses -lt 1) {
        Add-ValidationError "Sandbox.SecureDeletionPasses" "Secure deletion passes must be at least 1"
    } elseif ($sandbox.SecureDeletionPasses -gt 10) {
        Add-ValidationWarning "Sandbox.SecureDeletionPasses" "High number of deletion passes may impact performance"
    }
}

function Test-PrintConfiguration {
    param($Config)
    
    if ($Detailed) { Write-Host "Validating print configuration..." -ForegroundColor Cyan }
    
    $print = $Config.Print
    if (-not $print) { return }
    
    # Max Copies
    if ($print.MaxCopiesAllowed -le 0) {
        Add-ValidationError "Print.MaxCopiesAllowed" "Max copies must be greater than 0"
    } elseif ($print.MaxCopiesAllowed -gt 100) {
        Add-ValidationWarning "Print.MaxCopiesAllowed" "High copy limit may lead to resource exhaustion"
    }
    
    # Print Timeout
    if ($print.PrintTimeoutSeconds -le 0) {
        Add-ValidationError "Print.PrintTimeoutSeconds" "Print timeout must be greater than 0"
    } elseif ($print.PrintTimeoutSeconds -lt 30) {
        Add-ValidationWarning "Print.PrintTimeoutSeconds" "Short print timeout may cause premature job cancellation"
    }
    
    # Default Printer
    if ($print.DefaultPrinterName) {
        try {
            $printers = Get-Printer -ErrorAction SilentlyContinue
            if ($printers -and -not ($printers | Where-Object { $_.Name -eq $print.DefaultPrinterName })) {
                Add-ValidationWarning "Print.DefaultPrinterName" "Default printer '$($print.DefaultPrinterName)' is not installed"
            }
        }
        catch {
            Add-ValidationWarning "Print.DefaultPrinterName" "Could not validate printer installation"
        }
    }
}

function Test-ApiConfiguration {
    param($Config)
    
    if ($Detailed) { Write-Host "Validating API configuration..." -ForegroundColor Cyan }
    
    $api = $Config.Api
    if (-not $api) { return }
    
    # Ports
    if ($api.HttpPort -le 0 -or $api.HttpPort -gt 65535) {
        Add-ValidationError "Api.HttpPort" "HTTP port must be between 1 and 65535"
    }
    
    if ($api.HttpsPort -le 0 -or $api.HttpsPort -gt 65535) {
        Add-ValidationError "Api.HttpsPort" "HTTPS port must be between 1 and 65535"
    }
    
    if ($api.HttpPort -eq $api.HttpsPort) {
        Add-ValidationError "Api.Ports" "HTTP and HTTPS ports cannot be the same"
    }
    
    # Allowed Origins
    if (-not $api.AllowedOrigins -or $api.AllowedOrigins.Count -eq 0) {
        Add-ValidationWarning "Api.AllowedOrigins" "No allowed origins configured - CORS may not work"
    } else {
        foreach ($origin in $api.AllowedOrigins) {
            if ($origin -match "localhost|127\.0\.0\.1") {
                Add-ValidationWarning "Api.AllowedOrigins" "Localhost origins should only be used in development"
            }
        }
    }
    
    # Request Size
    if ($api.MaxRequestSizeBytes -le 0) {
        Add-ValidationError "Api.MaxRequestSizeBytes" "Max request size must be greater than 0"
    }
    
    # Timeout
    if ($api.RequestTimeoutSeconds -le 0) {
        Add-ValidationError "Api.RequestTimeoutSeconds" "Request timeout must be greater than 0"
    }
}

function Test-SystemRequirements {
    if ($Detailed) { Write-Host "Checking system requirements..." -ForegroundColor Cyan }
    
    # Windows Version
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -lt 10) {
        Add-ValidationWarning "System.WindowsVersion" "Windows 10 or later is recommended"
    } else {
        Add-ValidationInfo "System.WindowsVersion" "Windows version is supported"
    }
    
    # Print Spooler
    try {
        $spooler = Get-Service -Name "Spooler" -ErrorAction Stop
        if ($spooler.Status -eq "Running") {
            Add-ValidationInfo "System.PrintSpooler" "Print Spooler service is running"
        } else {
            Add-ValidationWarning "System.PrintSpooler" "Print Spooler service is not running"
        }
    }
    catch {
        Add-ValidationError "System.PrintSpooler" "Print Spooler service is not available"
    }
    
    # Disk Space
    try {
        $tempPath = [System.Environment]::ExpandEnvironmentVariables("%TEMP%")
        $drive = Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DeviceID -eq (Split-Path -Qualifier $tempPath) }
        $freeSpaceGB = [math]::Round($drive.FreeSpace / 1GB, 2)
        
        if ($freeSpaceGB -lt 1) {
            Add-ValidationError "System.DiskSpace" "Insufficient disk space: ${freeSpaceGB}GB available"
        } elseif ($freeSpaceGB -lt 5) {
            Add-ValidationWarning "System.DiskSpace" "Low disk space: ${freeSpaceGB}GB available"
        } else {
            Add-ValidationInfo "System.DiskSpace" "Sufficient disk space available: ${freeSpaceGB}GB"
        }
    }
    catch {
        Add-ValidationWarning "System.DiskSpace" "Could not check disk space"
    }
}

# Main validation logic
function Start-ConfigValidation {
    Write-Host "ACCHU Sandbox Engine - Configuration Validation" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "Configuration File: $ConfigFile" -ForegroundColor Yellow
    if ($Environment) {
        Write-Host "Environment: $Environment" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # Check if file exists
    if (-not (Test-Path $ConfigFile)) {
        Write-Host "ERROR: Configuration file not found: $ConfigFile" -ForegroundColor Red
        exit 1
    }
    
    # Parse JSON
    $config = Test-JsonSyntax -FilePath $ConfigFile
    if (-not $config) {
        Write-Host "Cannot continue validation due to JSON syntax errors." -ForegroundColor Red
        exit 1
    }
    
    # Run validation tests
    Test-RequiredSections -Config $config
    Test-SecurityConfiguration -Config $config
    Test-SandboxConfiguration -Config $config
    Test-PrintConfiguration -Config $config
    Test-ApiConfiguration -Config $config
    Test-SystemRequirements
    
    # Display results
    Write-Host ""
    
    if ($ValidationResults.Info.Count -gt 0 -and $Detailed) {
        Write-Host "Information:" -ForegroundColor Cyan
        foreach ($info in $ValidationResults.Info) {
            Write-Host "  [INFO] $($info.Section): $($info.Message)" -ForegroundColor White
        }
        Write-Host ""
    }
    
    if ($ValidationResults.Warnings.Count -gt 0) {
        Write-Host "Warnings:" -ForegroundColor Yellow
        foreach ($warning in $ValidationResults.Warnings) {
            Write-Host "  [WARN] $($warning.Section): $($warning.Message)" -ForegroundColor Yellow
        }
        Write-Host ""
    }
    
    if ($ValidationResults.Errors.Count -gt 0) {
        Write-Host "Errors:" -ForegroundColor Red
        foreach ($error in $ValidationResults.Errors) {
            Write-Host "  [ERROR] $($error.Section): $($error.Message)" -ForegroundColor Red
        }
        Write-Host ""
    }
    
    # Summary
    if ($ValidationResults.IsValid) {
        Write-Host "✓ Configuration validation PASSED" -ForegroundColor Green
        if ($ValidationResults.Warnings.Count -gt 0) {
            Write-Host "  $($ValidationResults.Warnings.Count) warning(s) found - review recommended" -ForegroundColor Yellow
        }
        exit 0
    } else {
        Write-Host "✗ Configuration validation FAILED" -ForegroundColor Red
        Write-Host "  $($ValidationResults.Errors.Count) error(s) must be fixed before deployment" -ForegroundColor Red
        exit 1
    }
}

# Execute validation
try {
    Start-ConfigValidation
}
catch {
    Write-Host "Configuration validation failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}