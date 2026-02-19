# ACCHU Sandbox Engine Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting information for the ACCHU Sandbox Engine Windows Service. It covers common issues, diagnostic procedures, and resolution steps.

## Quick Diagnostic Commands

### Service Status

```cmd
REM Check service status
sc query AcchuSandboxEngine

REM Check service configuration
sc qc AcchuSandboxEngine

REM View service dependencies
sc enumdepend AcchuSandboxEngine
```

### Configuration Validation

```cmd
REM Validate current configuration
AcchuSandboxEngine.exe --validate-config

REM Test with specific config file
AcchuSandboxEngine.exe --validate-config --config appsettings.Production.json
```

### Health Check

```powershell
# Test service health endpoint
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 10
    Write-Host "Health Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Health endpoint not responding: $($_.Exception.Message)" -ForegroundColor Red
}
```

### Log Analysis

```powershell
# Check recent Windows Event Log entries
Get-EventLog -LogName Application -Source "ACCHU Sandbox Engine" -Newest 20 | 
    Format-Table TimeGenerated, EntryType, Message -Wrap

# Check service log files
$logPath = "$env:TEMP\AcchuSandbox\Logs"
if (Test-Path $logPath) {
    Get-ChildItem $logPath -Filter "service-*.log" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1 | 
        ForEach-Object { Get-Content $_.FullName | Select-Object -Last 50 }
}
```

## Common Issues and Solutions

### 1. Service Won't Start

#### Symptoms
- Service fails to start
- Event Log shows startup errors
- Service status shows "Stopped" or "Start Pending"

#### Diagnostic Steps

```cmd
REM Check service status
sc query AcchuSandboxEngine

REM Check for startup errors in Event Log
wevtutil qe Application /q:"*[System[Provider[@Name='ACCHU Sandbox Engine'] and Level<=3]]" /f:text /c:10
```

#### Common Causes and Solutions

**Configuration Errors**
```cmd
REM Validate configuration
AcchuSandboxEngine.exe --validate-config
```
- **JWT Secret Key**: Ensure it's changed from default value
- **File Paths**: Verify all paths exist and are accessible
- **JSON Syntax**: Check for malformed JSON

**Permission Issues**
```cmd
REM Check service account permissions
sc qc AcchuSandboxEngine

REM Verify directory permissions
icacls "%TEMP%\AcchuSandbox"
```
- **Service Account**: Ensure Local Service has necessary permissions
- **Directory Access**: Verify write permissions to temp directories
- **Registry Access**: Check service can access configuration

**Dependency Issues**
```cmd
REM Check Print Spooler status
sc query Spooler

REM Start Print Spooler if stopped
sc start Spooler
```
- **Print Spooler**: Must be running for service to start
- **.NET Runtime**: Verify .NET 8.0 is installed

### 2. Configuration Validation Failures

#### Symptoms
- Configuration validation fails during startup
- Specific configuration errors in logs

#### Resolution Steps

**JWT Configuration Issues**
```json
{
  "Security": {
    "JwtSecretKey": "MUST-BE-CHANGED-FROM-DEFAULT-VALUE-256-BITS",
    "JwtIssuer": "ACCHU-Backend-Production",
    "JwtAudience": "ACCHU-Sandbox-Engine"
  }
}
```

**Path Configuration Issues**
```json
{
  "Sandbox": {
    "TempDirectoryRoot": "%TEMP%\\AcchuSandbox",
    "SecurityLogPath": "%TEMP%\\AcchuSandbox\\SecurityLogs"
  }
}
```

**Validation Command**
```cmd
REM Test configuration after changes
AcchuSandboxEngine.exe --validate-config
```

### 3. Print Jobs Fail

#### Symptoms
- Print jobs are submitted but don't print
- Print status shows "Failed"
- Printer-related errors in logs

#### Diagnostic Steps

```powershell
# Check installed printers
Get-Printer | Format-Table Name, PrinterStatus, JobCount

# Check print spooler service
Get-Service -Name "Spooler"

# Check print queue
Get-PrintJob -PrinterName "YourPrinterName"
```

#### Common Solutions

**Printer Configuration**
```json
{
  "Print": {
    "DefaultPrinterName": "HP LaserJet Pro",
    "PrintTimeoutSeconds": 300,
    "MaxCopiesAllowed": 10
  }
}
```

**Service Account Permissions**
```cmd
REM Grant print permissions to Local Service
REM This may require domain/local policy changes
```

**Print Spooler Issues**
```cmd
REM Restart Print Spooler
sc stop Spooler
sc start Spooler

REM Clear print queue
REM Navigate to C:\Windows\System32\spool\PRINTERS and delete files
```

### 4. High Disk Usage

#### Symptoms
- Temporary directory grows large
- Disk space warnings
- Performance degradation

#### Diagnostic Steps

```cmd
REM Check sandbox directory size
dir "%TEMP%\AcchuSandbox" /s

REM Check for orphaned sessions
dir "%TEMP%\AcchuSandbox" /ad

REM Check cleanup logs
type "%TEMP%\AcchuSandbox\Logs\service-*.log" | findstr "Cleanup"
```

#### Solutions

**Manual Cleanup**
```cmd
REM Stop service first
sc stop AcchuSandboxEngine

REM Clean temporary files (CAUTION: Only when service is stopped)
rmdir /s /q "%TEMP%\AcchuSandbox\Sessions"

REM Start service
sc start AcchuSandboxEngine
```

**Configuration Adjustments**
```json
{
  "Sandbox": {
    "MaxSessionDurationMinutes": 30,
    "SecureDeletionPasses": 3,
    "MaxFileSizeBytes": 52428800
  }
}
```

### 5. Network Connectivity Issues

#### Symptoms
- API endpoints not responding
- Connection timeouts
- ACCHU Backend communication failures

#### Diagnostic Steps

```cmd
REM Test local API endpoints
curl -I http://localhost:8080/health
curl -I https://localhost:8443/health

REM Check port availability
netstat -an | findstr ":8080"
netstat -an | findstr ":8443"

REM Test external connectivity
ping acchu-backend.production.com
nslookup acchu-backend.production.com
```

#### Solutions

**Firewall Configuration**
```cmd
REM Add firewall rules (run as Administrator)
netsh advfirewall firewall add rule name="ACCHU Sandbox HTTP" dir=in action=allow protocol=TCP localport=8080
netsh advfirewall firewall add rule name="ACCHU Sandbox HTTPS" dir=in action=allow protocol=TCP localport=8443
```

**Port Conflicts**
```cmd
REM Check what's using the ports
netstat -ano | findstr ":8080"
netstat -ano | findstr ":8443"

REM Change ports in configuration if needed
```

**SSL Certificate Issues**
```powershell
# Check certificate store
Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*acchu*"}

# Test SSL connectivity
Test-NetConnection -ComputerName localhost -Port 8443
```

### 6. Security Violations

#### Symptoms
- Security violation events in logs
- Sessions being invalidated unexpectedly
- Unauthorized access attempts

#### Investigation Steps

```powershell
# Check security logs
$securityLogPath = "$env:TEMP\AcchuSandbox\SecurityLogs"
if (Test-Path $securityLogPath) {
    Get-ChildItem $securityLogPath -Filter "*.log" | 
        ForEach-Object { Get-Content $_.FullName | Select-String "VIOLATION" }
}

# Check Windows Event Log for security events
Get-EventLog -LogName Application -Source "ACCHU Sandbox Engine" | 
    Where-Object {$_.EntryType -eq "Warning" -or $_.EntryType -eq "Error"} |
    Select-Object TimeGenerated, EntryType, Message
```

#### Resolution Steps

**Token Validation Issues**
```json
{
  "Security": {
    "JwtSecretKey": "ENSURE-THIS-MATCHES-BACKEND-KEY",
    "JwtIssuer": "MUST-MATCH-BACKEND-ISSUER",
    "ValidateIssuer": true,
    "ValidateLifetime": true
  }
}
```

**File Source Validation**
```json
{
  "Security": {
    "ExpectedFileSource": "ACCHU-Backend-Production",
    "EnableSecurityEventLogging": true
  }
}
```

### 7. Performance Issues

#### Symptoms
- Slow session creation
- Long file processing times
- High CPU or memory usage

#### Performance Monitoring

```powershell
# Check service performance
Get-Process -Name "AcchuSandboxEngine" | 
    Select-Object ProcessName, CPU, WorkingSet, VirtualMemorySize

# Monitor disk I/O
Get-Counter "\LogicalDisk(*)\Disk Reads/sec", "\LogicalDisk(*)\Disk Writes/sec"

# Check memory usage
Get-Counter "\Memory\Available MBytes"
```

#### Optimization Steps

**Configuration Tuning**
```json
{
  "Sandbox": {
    "SecureDeletionPasses": 3,
    "MaxFileSizeBytes": 52428800
  },
  "Api": {
    "RequestTimeoutSeconds": 120,
    "MaxRequestSizeBytes": 52428800
  }
}
```

**System Optimization**
- Ensure adequate RAM (4GB+ recommended)
- Use SSD storage for temporary directories
- Regular disk cleanup and defragmentation

## Advanced Diagnostics

### Memory Dump Analysis

```cmd
REM Create memory dump if service crashes
REM Configure Windows Error Reporting to create dumps
reg add "HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\AcchuSandboxEngine.exe" /v DumpType /t REG_DWORD /d 2
```

### Performance Counters

```powershell
# Monitor custom performance counters
$counters = @(
    "\Process(AcchuSandboxEngine)\% Processor Time",
    "\Process(AcchuSandboxEngine)\Working Set",
    "\Process(AcchuSandboxEngine)\Handle Count"
)

Get-Counter -Counter $counters -SampleInterval 5 -MaxSamples 12
```

### Network Tracing

```cmd
REM Enable network tracing
netsh trace start capture=yes tracefile=acchu-network.etl provider=Microsoft-Windows-TCPIP

REM Reproduce issue, then stop tracing
netsh trace stop

REM Convert to readable format
netsh trace convert acchu-network.etl
```

## Recovery Procedures

### Service Recovery

```cmd
REM Stop service
sc stop AcchuSandboxEngine

REM Clear any locks or temporary files
taskkill /f /im AcchuSandboxEngine.exe

REM Clean temporary directories (when service is stopped)
rmdir /s /q "%TEMP%\AcchuSandbox\Sessions"

REM Start service
sc start AcchuSandboxEngine
```

### Configuration Recovery

```cmd
REM Backup current configuration
copy appsettings.json appsettings.json.backup

REM Restore known good configuration
copy appsettings.json.good appsettings.json

REM Validate restored configuration
AcchuSandboxEngine.exe --validate-config

REM Restart service
sc stop AcchuSandboxEngine
sc start AcchuSandboxEngine
```

### Database/State Recovery

```cmd
REM Clear any persistent state (if applicable)
REM The service is designed to be stateless, but clear any cached data

REM Reset security logs if corrupted
del "%TEMP%\AcchuSandbox\SecurityLogs\*.log"

REM Reset service logs
del "%TEMP%\AcchuSandbox\Logs\*.log"
```

## Preventive Measures

### Regular Maintenance

```powershell
# Weekly maintenance script
$maintenanceScript = @"
# Check service status
Get-Service -Name AcchuSandboxEngine

# Check disk space
Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq 'C:'} | 
    Select-Object DeviceID, @{Name='FreeSpaceGB';Expression={[math]::Round($_.FreeSpace/1GB,2)}}

# Check recent errors
Get-EventLog -LogName Application -Source "ACCHU Sandbox Engine" -EntryType Error -Newest 10

# Validate configuration
& "C:\Path\To\AcchuSandboxEngine.exe" --validate-config
"@

# Save and schedule this script
```

### Monitoring Setup

```powershell
# Set up basic monitoring
$monitoringScript = @"
# Health check
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 10
    if ($response.StatusCode -ne 200) {
        Write-EventLog -LogName Application -Source "ACCHU Monitor" -EventId 1001 -EntryType Warning -Message "Health check failed"
    }
} catch {
    Write-EventLog -LogName Application -Source "ACCHU Monitor" -EventId 1002 -EntryType Error -Message "Health endpoint unreachable"
}
"@
```

## Contact and Support

### Information to Collect

When contacting support, please provide:

1. **Service Status**: Output of `sc query AcchuSandboxEngine`
2. **Configuration**: Sanitized configuration files (remove secrets)
3. **Event Logs**: Recent entries from Windows Event Log
4. **Service Logs**: Recent service log files
5. **System Information**: OS version, .NET version, hardware specs
6. **Error Details**: Specific error messages and timestamps

### Log Collection Script

```powershell
# Automated log collection
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir = "C:\Temp\AcchuSandboxEngine-Logs-$timestamp"
New-Item -ItemType Directory -Path $outputDir -Force

# Collect service status
sc query AcchuSandboxEngine > "$outputDir\service-status.txt"
sc qc AcchuSandboxEngine > "$outputDir\service-config.txt"

# Collect event logs
Get-EventLog -LogName Application -Source "ACCHU Sandbox Engine" -Newest 100 | 
    Export-Csv "$outputDir\event-logs.csv" -NoTypeInformation

# Collect service logs
$logPath = "$env:TEMP\AcchuSandbox\Logs"
if (Test-Path $logPath) {
    Copy-Item "$logPath\*" "$outputDir\" -Recurse
}

# Collect configuration (sanitized)
$config = Get-Content "appsettings.json" | ConvertFrom-Json
$config.Security.JwtSecretKey = "***REDACTED***"
$config | ConvertTo-Json -Depth 10 | Out-File "$outputDir\configuration-sanitized.json"

Write-Host "Logs collected in: $outputDir"
```

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Applies To**: ACCHU Sandbox Engine v1.0+