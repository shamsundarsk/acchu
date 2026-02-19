# ACCHU Sandbox Engine Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the ACCHU Sandbox Engine Windows Service in production environments. The service provides secure, ephemeral sandbox workspaces for customer document printing with automatic data destruction.

## Prerequisites

### System Requirements

- **Operating System**: Windows 10 or Windows Server 2016 or later
- **Framework**: .NET 8.0 Runtime
- **Architecture**: x64
- **Memory**: Minimum 2GB RAM, 4GB recommended
- **Disk Space**: Minimum 5GB free space for temporary files
- **Network**: HTTP/HTTPS connectivity for API endpoints

### Required Services

- **Print Spooler**: Must be running for print functionality
- **Windows Event Log**: For audit logging
- **Windows Security**: For ACL enforcement

### Permissions

- **Administrator privileges** required for installation
- **Local Service account** recommended for service execution
- **Write permissions** to temp directories
- **Print permissions** for the service account

## Pre-Deployment Checklist

### 1. Build and Publish Application

```bash
# Build the application
dotnet build --configuration Release

# Publish for deployment
dotnet publish --configuration Release --output "C:\Deploy\AcchuSandboxEngine"
```

### 2. Configuration Preparation

1. **Review Configuration Files**:
   - `appsettings.json` - Base configuration
   - `appsettings.Production.json` - Production overrides
   - `appsettings.Development.json` - Development settings

2. **Critical Configuration Items**:
   - **JWT Secret Key**: Must be changed from default value
   - **ACCHU Backend URLs**: Update to production endpoints
   - **File Size Limits**: Adjust based on requirements
   - **Security Settings**: Review and customize

3. **Security Configuration Checklist**:
   ```json
   {
     "Security": {
       "JwtSecretKey": "CHANGE-THIS-TO-SECURE-256-BIT-KEY",
       "JwtIssuer": "ACCHU-Backend-Production",
       "ExpectedFileSource": "ACCHU-Backend-Production"
     }
   }
   ```

### 3. Network Configuration

- **Firewall Rules**: Open ports 8080 (HTTP) and 8443 (HTTPS)
- **SSL Certificates**: Install if using HTTPS
- **DNS Resolution**: Ensure ACCHU Backend is resolvable

## Deployment Methods

### Method 1: Automated Deployment (Recommended)

#### Using PowerShell Script

```powershell
# Run as Administrator
.\Scripts\Deploy-AcchuSandboxEngine.ps1 -Environment Production

# Validate configuration only
.\Scripts\Deploy-AcchuSandboxEngine.ps1 -ValidateOnly

# Force deployment with warnings
.\Scripts\Deploy-AcchuSandboxEngine.ps1 -Force
```

#### Using Batch Script

```cmd
REM Run as Administrator
Scripts\deploy-service.bat
```

### Method 2: Manual Deployment

#### Step 1: Configuration Validation

```cmd
AcchuSandboxEngine.exe --validate-config
```

#### Step 2: Service Installation

```cmd
REM Install service
sc create AcchuSandboxEngine binPath= "C:\Deploy\AcchuSandboxEngine\AcchuSandboxEngine.exe" start= auto DisplayName= "ACCHU Sandbox Engine" depend= "Spooler"

REM Set description
sc description AcchuSandboxEngine "ACCHU Sandbox Engine provides secure, ephemeral sandbox workspaces for customer document printing."

REM Configure recovery
sc failure AcchuSandboxEngine reset= 86400 actions= restart/60000/restart/120000/restart/300000

REM Set service account
sc config AcchuSandboxEngine obj= "NT AUTHORITY\LOCAL SERVICE"

REM Start service
sc start AcchuSandboxEngine
```

#### Step 3: Directory Setup

```cmd
REM Create required directories
mkdir "%TEMP%\AcchuSandbox"
mkdir "%TEMP%\AcchuSandbox\SecurityLogs"
mkdir "%TEMP%\AcchuSandbox\Logs"

REM Set permissions
icacls "%TEMP%\AcchuSandbox" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)F" /T
```

## Configuration Reference

### Core Configuration Sections

#### Sandbox Configuration

```json
{
  "Sandbox": {
    "TempDirectoryRoot": "%TEMP%\\AcchuSandbox",
    "MaxSessionDurationMinutes": 60,
    "MaxFileSizeBytes": 104857600,
    "AllowedFileTypes": [".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"],
    "SecureDeletionPasses": 7,
    "EnableAuditLogging": true,
    "ServiceAccountName": "NT AUTHORITY\\LOCAL SERVICE"
  }
}
```

#### Security Configuration

```json
{
  "Security": {
    "JwtSecretKey": "YOUR-SECURE-256-BIT-KEY-HERE",
    "JwtIssuer": "ACCHU-Backend-Production",
    "JwtAudience": "ACCHU-Sandbox-Engine",
    "TokenExpirationMinutes": 60,
    "ExpectedFileSource": "ACCHU-Backend-Production",
    "EnableSecurityEventLogging": true,
    "AllowedActions": ["Print", "Preview"],
    "RestrictedActions": ["Save", "Copy", "Export", "Edit"]
  }
}
```

#### Print Configuration

```json
{
  "Print": {
    "DefaultPrinterName": "",
    "MaxCopiesAllowed": 10,
    "AllowColorPrinting": true,
    "AllowDoubleSided": true,
    "PrintTimeoutSeconds": 300
  }
}
```

#### API Configuration

```json
{
  "Api": {
    "HttpPort": 8080,
    "HttpsPort": 8443,
    "AllowedOrigins": ["https://acchu-backend.production.com"],
    "MaxRequestSizeBytes": 104857600,
    "RequestTimeoutSeconds": 300
  }
}
```

### Environment-Specific Configurations

#### Production Settings

- **Logging**: Information level, Event Log enabled
- **Security**: Enhanced security settings, longer deletion passes
- **Performance**: Optimized for production workloads
- **Monitoring**: Full audit logging enabled

#### Development Settings

- **Logging**: Debug level, Console output
- **Security**: Relaxed for testing (still secure)
- **Performance**: Faster cleanup for development cycles
- **Monitoring**: Detailed tracing enabled

## Post-Deployment Verification

### 1. Service Status Check

```cmd
REM Check service status
sc query AcchuSandboxEngine

REM Check service configuration
sc qc AcchuSandboxEngine
```

### 2. Health Endpoint Test

```powershell
# Test health endpoint
Invoke-WebRequest -Uri "http://localhost:8080/health"

# Expected response: 200 OK with health status
```

### 3. Log Verification

```powershell
# Check Windows Event Log
Get-EventLog -LogName Application -Source "ACCHU Sandbox Engine" -Newest 10

# Check service logs
Get-Content "%TEMP%\AcchuSandbox\Logs\service-*.log" | Select-Object -Last 20
```

### 4. Configuration Validation

```cmd
REM Validate configuration
AcchuSandboxEngine.exe --validate-config
```

### 5. Directory Permissions

```cmd
REM Check directory permissions
icacls "%TEMP%\AcchuSandbox"
```

## Monitoring and Maintenance

### Health Monitoring

The service provides several monitoring endpoints:

- **Health Check**: `GET /health`
- **Diagnostics**: `GET /diagnostics`
- **Service Status**: `GET /status`

### Log Locations

- **Windows Event Log**: Application log, source "ACCHU Sandbox Engine"
- **Service Logs**: `%TEMP%\AcchuSandbox\Logs\service-YYYY-MM-DD.log`
- **Security Logs**: `%TEMP%\AcchuSandbox\SecurityLogs\`

### Performance Counters

Monitor these key metrics:

- **Active Sessions**: Number of concurrent sessions
- **File Processing Rate**: Files processed per minute
- **Print Job Success Rate**: Successful vs failed print jobs
- **Cleanup Success Rate**: Successful cleanup operations
- **Disk Space Usage**: Temporary directory usage

### Maintenance Tasks

#### Daily Tasks

- Review security logs for violations
- Check disk space usage
- Verify service is running

#### Weekly Tasks

- Review performance metrics
- Check for Windows updates
- Validate configuration integrity

#### Monthly Tasks

- Review and rotate logs
- Update security certificates if applicable
- Performance tuning review

## Troubleshooting

### Common Issues

#### Service Won't Start

**Symptoms**: Service fails to start, Event Log shows errors

**Solutions**:
1. Check configuration file validity
2. Verify file permissions
3. Ensure Print Spooler is running
4. Check .NET runtime installation

```cmd
REM Check configuration
AcchuSandboxEngine.exe --validate-config

REM Check Print Spooler
sc query Spooler

REM Check .NET runtime
dotnet --version
```

#### Configuration Validation Errors

**Symptoms**: Configuration validation fails during startup

**Solutions**:
1. Review JWT secret key (must be changed from default)
2. Check file paths and permissions
3. Validate JSON syntax
4. Ensure required sections are present

#### Print Jobs Fail

**Symptoms**: Print jobs are submitted but fail to print

**Solutions**:
1. Check printer status and connectivity
2. Verify Print Spooler service
3. Check service account permissions
4. Review print configuration settings

#### High Disk Usage

**Symptoms**: Temporary directory grows large, disk space warnings

**Solutions**:
1. Check cleanup process is running
2. Verify secure deletion is working
3. Review session timeout settings
4. Monitor for orphaned sessions

### Diagnostic Commands

```cmd
REM Service status
sc query AcchuSandboxEngine

REM Service configuration
sc qc AcchuSandboxEngine

REM Event log errors
wevtutil qe Application /q:"*[System[Provider[@Name='ACCHU Sandbox Engine'] and Level=2]]" /f:text

REM Check disk space
dir "%TEMP%\AcchuSandbox" /s

REM Test configuration
AcchuSandboxEngine.exe --validate-config

REM Check network connectivity
curl -I http://localhost:8080/health
```

### Log Analysis

#### Security Events

Look for these event types in security logs:
- **SessionStarted**: New session initiated
- **SecurityViolation**: Unauthorized access attempts
- **CleanupCompleted**: Successful data destruction
- **SessionInvalidated**: Fail-closed security response

#### Performance Events

Monitor these performance indicators:
- Session creation time
- File processing duration
- Print job completion time
- Cleanup operation duration

## Security Considerations

### Service Account Security

- Use **Local Service** account for minimal privileges
- Avoid using **Local System** or administrator accounts
- Regularly review account permissions

### Network Security

- Use HTTPS for production deployments
- Implement proper firewall rules
- Consider network segmentation

### Data Protection

- Verify secure deletion is working
- Monitor for data residue
- Regular security audits
- Compliance with data protection regulations

### Access Control

- Restrict physical access to the server
- Monitor service configuration changes
- Implement proper backup and recovery procedures

## Backup and Recovery

### Configuration Backup

```cmd
REM Backup configuration files
copy "appsettings.json" "backup\appsettings.json.%DATE%"
copy "appsettings.Production.json" "backup\appsettings.Production.json.%DATE%"
```

### Service Recovery

```cmd
REM Stop service
sc stop AcchuSandboxEngine

REM Restore configuration
copy "backup\appsettings.json.YYYY-MM-DD" "appsettings.json"

REM Start service
sc start AcchuSandboxEngine
```

### Disaster Recovery

1. **Document current configuration**
2. **Backup service executable and configuration**
3. **Test recovery procedures regularly**
4. **Maintain deployment scripts**

## Support and Contact

For deployment issues or questions:

1. **Check Event Logs**: Windows Application log
2. **Review Configuration**: Use validation tools
3. **Consult Documentation**: This guide and API documentation
4. **Contact Support**: Provide logs and configuration details

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Applies To**: ACCHU Sandbox Engine v1.0+