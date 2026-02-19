# ACCHU Sandbox Engine - Integration Architecture

## Overview

This document describes the complete integration and wiring of all components in the ACCHU Sandbox Engine, implemented as part of task 13.1. The system now provides comprehensive session lifecycle orchestration, monitoring, diagnostics, and health checks.

## Component Integration

### Core Service Dependencies

The services are wired together with the following dependency hierarchy:

```
Program.cs (Service Host)
├── SecurityManager (Base dependency)
├── CleanupManager (Depends on SecurityManager)
├── FileSystemManager (Depends on SecurityManager, CleanupManager)
├── PrintManager (Depends on SecurityManager)
├── MonitoringService (Independent, provides metrics)
├── DiagnosticsService (Depends on all services)
└── SessionManager (Orchestrates all services)
```

### Dependency Injection Configuration

```csharp
// Register services in correct dependency order
builder.Services.AddSingleton<ISecurityManager, SecurityManager>();
builder.Services.AddSingleton<ICleanupManager, CleanupManager>();
builder.Services.AddSingleton<IFileSystemManager, FileSystemManager>();
builder.Services.AddSingleton<IPrintManager, PrintManager>();

// Register monitoring service
builder.Services.AddSingleton<MonitoringService>();
builder.Services.AddHostedService<MonitoringService>(provider => provider.GetRequiredService<MonitoringService>());

// Register diagnostics service
builder.Services.AddSingleton<DiagnosticsService>();

// Register session manager with all dependencies
builder.Services.AddSingleton<ISessionManager, SessionManager>();
```

## Session Lifecycle Orchestration

### Complete Session Flow

The SessionManager now orchestrates the complete session lifecycle:

1. **Session Start**
   - Validates session token through SecurityManager
   - Enforces session exclusivity (only one active session)
   - Creates sandbox workspace through FileSystemManager
   - Records session start in MonitoringService
   - Logs security event through SecurityManager

2. **File Processing**
   - Validates file source through SecurityManager
   - Stores file securely through FileSystemManager
   - Validates file content through FileSystemManager
   - Records file processing metrics in MonitoringService
   - Logs file processing event through SecurityManager

3. **Print Job Execution**
   - Submits print job through PrintManager
   - Monitors print job completion in background
   - Records print job metrics in MonitoringService
   - Logs print job events through SecurityManager
   - Automatically ends session on successful completion

4. **Session End**
   - Updates session status to completed
   - Records session end metrics in MonitoringService
   - Triggers comprehensive cleanup through CleanupManager
   - Logs session completion event through SecurityManager

5. **Error Handling (Fail-Closed)**
   - Invalidates session on any error
   - Triggers immediate cleanup through CleanupManager
   - Logs security events through SecurityManager
   - Enforces fail-closed behavior through SecurityManager

### Session State Management

```csharp
public class SessionState
{
    public string SessionId { get; set; }
    public string SessionToken { get; set; }
    public SessionStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string SandboxPath { get; set; }
    public List<SessionFile> Files { get; set; }
    public List<PrintJob> PrintJobs { get; set; }
    public Dictionary<string, object> Metadata { get; set; }
}
```

## Monitoring and Diagnostics

### MonitoringService

Provides comprehensive system monitoring:

- **Real-time Metrics**: CPU, memory, disk space, active sessions
- **Session Tracking**: Files processed, print jobs submitted, bytes processed
- **Performance Counters**: System resource utilization
- **Health Assessment**: Automated health checks every 5 minutes
- **Alert Generation**: Warnings for resource constraints

### DiagnosticsService

Provides detailed system diagnostics:

- **System Information**: OS, hardware, process details
- **Service Information**: Version, uptime, resource usage
- **Configuration**: Sanitized configuration display
- **Security Information**: User context, permissions, privileges
- **Printer Information**: Installed printers, spooler status
- **Health Checks**: Comprehensive system health validation
- **Recommendations**: Automated issue identification and suggestions

### Health Checks

The system includes multiple health check implementations:

1. **ServiceHealthCheck**: Core service functionality
2. **DiskSpaceHealthCheck**: Available disk space monitoring
3. **PrinterHealthCheck**: Printer availability and spooler status

## API Integration

### API Host Service

The ApiHostService provides:

- **RESTful Endpoints**: Session management, health checks, diagnostics
- **Authentication**: JWT-based authentication with configurable validation
- **Authorization**: Role-based access control
- **Security Headers**: Comprehensive security header configuration
- **CORS Configuration**: Secure cross-origin resource sharing
- **Error Handling**: Global exception handling with logging
- **Rate Limiting**: Request rate limiting middleware

### Diagnostic Endpoints

```
GET /api/diagnostics/health          - Basic health status
GET /api/diagnostics/report          - Comprehensive diagnostic report
GET /api/diagnostics/metrics         - Current system metrics
GET /api/diagnostics/config          - Service configuration (sanitized)
POST /api/diagnostics/healthcheck    - Perform comprehensive health check
```

## Logging and Monitoring

### Structured Logging

The system uses structured logging with multiple outputs:

- **Console Logging**: Development and debugging
- **File Logging**: Persistent log files with rotation
- **Windows Event Log**: System integration
- **Security Event Logging**: Audit trail for security events

### Log Configuration

```csharp
builder.Services.AddSerilog((services, lc) => lc
    .ReadFrom.Configuration(builder.Configuration)
    .WriteTo.File(
        Path.Combine(Environment.ExpandEnvironmentVariables("%TEMP%"), "AcchuSandbox", "Logs", "service-.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 30,
        shared: true,
        flushToDiskInterval: TimeSpan.FromSeconds(1))
    .WriteTo.Console()
    .Enrich.FromLogContext());
```

### Security Event Logging

All security-relevant events are logged:

- Session start/end
- File reception and processing
- Print job submission
- Security violations
- System health issues
- API access attempts

## Error Handling and Recovery

### Fail-Closed Security Model

The system implements comprehensive fail-closed behavior:

- **Session Invalidation**: Any error invalidates the current session
- **Automatic Cleanup**: Failed sessions trigger immediate cleanup
- **Security Logging**: All failures are logged as security events
- **Resource Cleanup**: System resources are always cleaned up

### Crash Recovery

The system handles crash recovery:

- **Startup Cleanup**: Orphaned sessions are cleaned up on startup
- **Shutdown Cleanup**: Active sessions are cleaned up on shutdown
- **Emergency Cleanup**: Critical errors trigger emergency cleanup
- **Resource Verification**: Post-cleanup verification ensures no residue

### Exception Handling

```csharp
// Global exception handling
AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
{
    var logger = host.Services.GetService<ILogger<Program>>();
    logger?.LogCritical(e.ExceptionObject as Exception, 
        "Unhandled exception occurred. Service will terminate.");
};

TaskScheduler.UnobservedTaskException += (sender, e) =>
{
    var logger = host.Services.GetService<ILogger<Program>>();
    logger?.LogError(e.Exception, "Unobserved task exception occurred");
    e.SetObserved(); // Prevent process termination
};
```

## Configuration Management

### Configuration Sections

The system uses strongly-typed configuration:

- **SandboxConfiguration**: Sandbox and file management settings
- **PrintConfiguration**: Print system settings
- **SecurityConfiguration**: Security and authentication settings

### Environment-Specific Configuration

```json
{
  "SandboxConfiguration": {
    "TempDirectoryRoot": "%TEMP%\\AcchuSandbox",
    "MaxSessionDurationMinutes": 60,
    "MaxFileSizeBytes": 104857600,
    "AllowedFileTypes": [".pdf", ".docx", ".txt", ".jpg", ".png"],
    "SecureDeletionPasses": 3,
    "EnableAuditLogging": true,
    "ServiceAccountName": "NT AUTHORITY\\SYSTEM"
  },
  "PrintConfiguration": {
    "DefaultPrinterName": "",
    "MaxCopiesAllowed": 10,
    "AllowColorPrinting": true,
    "AllowDoubleSided": true,
    "PrintTimeoutSeconds": 300
  },
  "SecurityConfiguration": {
    "ValidateIssuer": true,
    "ValidateAudience": true,
    "ValidateLifetime": true,
    "ValidateIssuerSigningKey": true,
    "JwtIssuer": "ACCHU_Backend",
    "JwtAudience": "ACCHU_SandboxEngine",
    "JwtSecretKey": "YourSecretKeyHere",
    "TokenExpirationMinutes": 60
  }
}
```

## Service Installation and Management

### Windows Service Installation

The service supports command-line installation:

```bash
AcchuSandboxEngine.exe install    # Install Windows service
AcchuSandboxEngine.exe uninstall  # Uninstall Windows service
AcchuSandboxEngine.exe start      # Start Windows service
AcchuSandboxEngine.exe stop       # Stop Windows service
```

### Service Recovery Configuration

The service is configured with automatic recovery:

- **First Failure**: Restart after 1 minute
- **Second Failure**: Restart after 2 minutes
- **Subsequent Failures**: Restart after 5 minutes
- **Reset Counter**: Every 24 hours

## Testing and Validation

### Integration Tests

Comprehensive integration tests validate:

- **Complete Session Lifecycle**: End-to-end session orchestration
- **Session Exclusivity**: Only one active session allowed
- **Fail-Closed Behavior**: Proper error handling and cleanup
- **Component Wiring**: All dependencies properly resolved
- **Monitoring Integration**: Metrics collection and reporting
- **Diagnostics Integration**: Health checks and reporting

### Test Coverage

The integration tests cover:

- Service registration and dependency injection
- Session lifecycle orchestration
- Error handling and recovery
- Monitoring and diagnostics
- API endpoint functionality
- Configuration validation

## Performance Considerations

### Resource Management

- **Memory Usage**: Monitored and logged continuously
- **Disk Space**: Checked before operations and monitored
- **CPU Usage**: Tracked and alerted on high usage
- **Thread Management**: Background tasks properly managed

### Scalability

- **Single Session Model**: Designed for one session at a time
- **Resource Cleanup**: Immediate cleanup after each session
- **Memory Efficiency**: Minimal memory footprint
- **Background Processing**: Non-blocking operations where possible

## Security Considerations

### Defense in Depth

- **Authentication**: JWT token validation
- **Authorization**: Role-based access control
- **Input Validation**: All inputs validated and sanitized
- **Output Encoding**: All outputs properly encoded
- **Audit Logging**: Comprehensive security event logging
- **Fail-Closed**: Secure failure modes

### Data Protection

- **Encryption in Transit**: HTTPS for all API communication
- **Secure Storage**: Files stored with restricted ACLs
- **Secure Deletion**: Multi-pass overwriting of sensitive data
- **Memory Protection**: Sensitive data cleared from memory
- **Access Control**: Windows ACLs restrict file access

## Maintenance and Operations

### Monitoring

- **Health Endpoints**: Real-time health status
- **Metrics Collection**: System and application metrics
- **Log Analysis**: Structured logging for analysis
- **Alert Generation**: Automated alerting on issues

### Troubleshooting

- **Diagnostic Reports**: Comprehensive system information
- **Health Checks**: Automated problem identification
- **Recommendations**: Automated issue resolution suggestions
- **Log Correlation**: Structured logging for issue tracking

This integration architecture ensures that all components work together seamlessly to provide a secure, monitored, and maintainable document processing system that meets all requirements while providing comprehensive observability and diagnostics.