using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Diagnostics;
using System.Drawing.Printing;
using System.Reflection;
using System.Security.Principal;
using System.ServiceProcess;

namespace AcchuSandboxEngine.Services;

/// <summary>
/// Service for comprehensive system diagnostics and troubleshooting
/// Provides detailed information about system state, configuration, and health
/// </summary>
public class DiagnosticsService
{
    private readonly ILogger<DiagnosticsService> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;
    private readonly IFileSystemManager _fileSystemManager;
    private readonly IPrintManager _printManager;
    private readonly ICleanupManager _cleanupManager;
    private readonly SandboxConfiguration _sandboxConfig;
    private readonly PrintConfiguration _printConfig;
    private readonly SecurityConfiguration _securityConfig;
    private readonly MonitoringService _monitoringService;

    public DiagnosticsService(
        ILogger<DiagnosticsService> logger,
        ISessionManager sessionManager,
        ISecurityManager securityManager,
        IFileSystemManager fileSystemManager,
        IPrintManager printManager,
        ICleanupManager cleanupManager,
        IOptions<SandboxConfiguration> sandboxConfig,
        IOptions<PrintConfiguration> printConfig,
        IOptions<SecurityConfiguration> securityConfig,
        MonitoringService monitoringService)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _securityManager = securityManager;
        _fileSystemManager = fileSystemManager;
        _printManager = printManager;
        _cleanupManager = cleanupManager;
        _sandboxConfig = sandboxConfig.Value;
        _printConfig = printConfig.Value;
        _securityConfig = securityConfig.Value;
        _monitoringService = monitoringService;
    }

    /// <summary>
    /// Generates a comprehensive diagnostic report
    /// </summary>
    public async Task<DiagnosticReport> GenerateDiagnosticReportAsync()
    {
        _logger.LogInformation("Generating comprehensive diagnostic report");

        var report = new DiagnosticReport
        {
            Timestamp = DateTime.UtcNow,
            ServiceVersion = GetServiceVersion(),
            SystemInfo = GetSystemInformation(),
            ServiceInfo = GetServiceInformation(),
            ConfigurationInfo = GetConfigurationInformation(),
            SecurityInfo = await GetSecurityInformationAsync(),
            PrinterInfo = GetPrinterInformation(),
            SessionInfo = GetSessionInformation(),
            HealthChecks = await PerformHealthChecksAsync(),
            SystemMetrics = _monitoringService.GetSystemMetrics(),
            Recommendations = new List<string>()
        };

        // Generate recommendations based on findings
        GenerateRecommendations(report);

        _logger.LogInformation("Diagnostic report generated successfully");
        return report;
    }

    /// <summary>
    /// Gets service version information
    /// </summary>
    private ServiceVersionInfo GetServiceVersion()
    {
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        var version = assembly.GetName().Version;
        var fileVersion = FileVersionInfo.GetVersionInfo(assembly.Location);

        return new ServiceVersionInfo
        {
            AssemblyVersion = version?.ToString() ?? "Unknown",
            FileVersion = fileVersion.FileVersion ?? "Unknown",
            ProductVersion = fileVersion.ProductVersion ?? "Unknown",
            BuildDate = GetBuildDate(assembly)
        };
    }

    /// <summary>
    /// Gets system information
    /// </summary>
    private SystemInformation GetSystemInformation()
    {
        return new SystemInformation
        {
            MachineName = Environment.MachineName,
            UserName = Environment.UserName,
            OSVersion = Environment.OSVersion.ToString(),
            ProcessorCount = Environment.ProcessorCount,
            Is64BitOperatingSystem = Environment.Is64BitOperatingSystem,
            Is64BitProcess = Environment.Is64BitProcess,
            WorkingSet = Environment.WorkingSet,
            SystemDirectory = Environment.SystemDirectory,
            CurrentDirectory = Environment.CurrentDirectory,
            TempPath = Path.GetTempPath(),
            UserDomainName = Environment.UserDomainName,
            IsUserInteractive = Environment.UserInteractive
        };
    }

    /// <summary>
    /// Gets service-specific information
    /// </summary>
    private ServiceInformation GetServiceInformation()
    {
        var process = Process.GetCurrentProcess();
        
        return new ServiceInformation
        {
            ProcessId = process.Id,
            ProcessName = process.ProcessName,
            StartTime = process.StartTime,
            ThreadCount = process.Threads.Count,
            HandleCount = process.HandleCount,
            WorkingSet64 = process.WorkingSet64,
            PrivateMemorySize64 = process.PrivateMemorySize64,
            VirtualMemorySize64 = process.VirtualMemorySize64,
            IsRunningAsService = IsRunningAsWindowsService(),
            ServiceAccount = GetServiceAccount()
        };
    }

    /// <summary>
    /// Gets configuration information (sanitized for security)
    /// </summary>
    private ConfigurationInformation GetConfigurationInformation()
    {
        return new ConfigurationInformation
        {
            SandboxConfig = new
            {
                TempDirectoryRoot = _sandboxConfig.TempDirectoryRoot,
                MaxSessionDurationMinutes = _sandboxConfig.MaxSessionDurationMinutes,
                MaxFileSizeBytes = _sandboxConfig.MaxFileSizeBytes,
                AllowedFileTypes = _sandboxConfig.AllowedFileTypes,
                SecureDeletionPasses = _sandboxConfig.SecureDeletionPasses,
                EnableAuditLogging = _sandboxConfig.EnableAuditLogging,
                ServiceAccountName = _sandboxConfig.ServiceAccountName
            },
            PrintConfig = new
            {
                DefaultPrinterName = _printConfig.DefaultPrinterName,
                MaxCopiesAllowed = _printConfig.MaxCopiesAllowed,
                AllowColorPrinting = _printConfig.AllowColorPrinting,
                AllowDoubleSided = _printConfig.AllowDoubleSided,
                PrintTimeoutSeconds = _printConfig.PrintTimeoutSeconds
            },
            SecurityConfig = new
            {
                ValidateIssuer = _securityConfig.ValidateIssuer,
                ValidateAudience = _securityConfig.ValidateAudience,
                ValidateLifetime = _securityConfig.ValidateLifetime,
                ValidateIssuerSigningKey = _securityConfig.ValidateIssuerSigningKey,
                JwtIssuer = _securityConfig.JwtIssuer,
                JwtAudience = _securityConfig.JwtAudience,
                // Note: JwtSecretKey is intentionally excluded for security
                TokenExpirationMinutes = _securityConfig.TokenExpirationMinutes
            }
        };
    }

    /// <summary>
    /// Gets security information
    /// </summary>
    private async Task<SecurityInformation> GetSecurityInformationAsync()
    {
        var currentUser = WindowsIdentity.GetCurrent();
        
        return new SecurityInformation
        {
            CurrentUser = currentUser.Name,
            IsAuthenticated = currentUser.IsAuthenticated,
            AuthenticationType = currentUser.AuthenticationType ?? "Unknown",
            IsSystem = currentUser.IsSystem,
            IsAnonymous = currentUser.IsAnonymous,
            IsGuest = currentUser.IsGuest,
            Groups = currentUser.Groups?.Select(g => g.Value).ToList() ?? new List<string>(),
            HasAdminPrivileges = IsRunningWithAdminPrivileges(),
            TempDirectoryPermissions = await CheckTempDirectoryPermissionsAsync()
        };
    }

    /// <summary>
    /// Gets printer information
    /// </summary>
    private PrinterInformation GetPrinterInformation()
    {
        var printers = new List<PrinterDetails>();
        
        foreach (string printerName in PrinterSettings.InstalledPrinters)
        {
            try
            {
                var settings = new PrinterSettings();
                settings.PrinterName = printerName;
                
                printers.Add(new PrinterDetails
                {
                    Name = printerName,
                    IsValid = settings.IsValid,
                    IsDefaultPrinter = settings.IsDefaultPrinter,
                    CanDuplex = settings.CanDuplex,
                    SupportsColor = settings.SupportsColor,
                    MaximumCopies = settings.MaximumCopies
                });
            }
            catch (Exception ex)
            {
                printers.Add(new PrinterDetails
                {
                    Name = printerName,
                    IsValid = false,
                    Error = ex.Message
                });
            }
        }

        // Check Print Spooler service
        var spoolerStatus = "Unknown";
        try
        {
            using var spoolerService = new ServiceController("Spooler");
            spoolerStatus = spoolerService.Status.ToString();
        }
        catch (Exception ex)
        {
            spoolerStatus = $"Error: {ex.Message}";
        }

        return new PrinterInformation
        {
            InstalledPrinters = printers,
            PrintSpoolerStatus = spoolerStatus,
            ConfiguredDefaultPrinter = _printConfig.DefaultPrinterName
        };
    }

    /// <summary>
    /// Gets session information
    /// </summary>
    private SessionInformation GetSessionInformation()
    {
        // This would need to be implemented based on SessionManager's internal state
        // For now, return basic information
        return new SessionInformation
        {
            ActiveSessionCount = 0, // Would need access to SessionManager's internal state
            TotalSessionsToday = 0, // Would need persistent storage
            AverageSessionDuration = TimeSpan.Zero // Would need historical data
        };
    }

    /// <summary>
    /// Performs comprehensive health checks
    /// </summary>
    private async Task<List<HealthCheckResult>> PerformHealthChecksAsync()
    {
        var results = new List<HealthCheckResult>();

        // Check temp directory accessibility
        results.Add(CheckTempDirectoryAccess());

        // Check disk space
        results.Add(CheckDiskSpace());

        // Check memory usage
        results.Add(CheckMemoryUsage());

        // Check service dependencies
        results.Add(await CheckServiceDependenciesAsync());

        return results;
    }

    /// <summary>
    /// Generates recommendations based on diagnostic findings
    /// </summary>
    private void GenerateRecommendations(DiagnosticReport report)
    {
        // Check for low disk space
        if (report.SystemMetrics.DiskFreeSpaceGB < 1.0)
        {
            report.Recommendations.Add("Critical: Free up disk space. Less than 1GB available.");
        }
        else if (report.SystemMetrics.DiskFreeSpaceGB < 5.0)
        {
            report.Recommendations.Add("Warning: Consider freeing up disk space. Less than 5GB available.");
        }

        // Check for high memory usage
        if (report.SystemMetrics.AvailableMemoryMB < 512)
        {
            report.Recommendations.Add("Warning: Low available memory. Consider closing other applications.");
        }

        // Check printer configuration
        if (report.PrinterInfo.InstalledPrinters.Count == 0)
        {
            report.Recommendations.Add("Critical: No printers installed. Install at least one printer.");
        }
        else if (!string.IsNullOrEmpty(report.PrinterInfo.ConfiguredDefaultPrinter))
        {
            var defaultPrinter = report.PrinterInfo.InstalledPrinters
                .FirstOrDefault(p => p.Name.Equals(report.PrinterInfo.ConfiguredDefaultPrinter, StringComparison.OrdinalIgnoreCase));
            
            if (defaultPrinter == null)
            {
                report.Recommendations.Add($"Warning: Configured default printer '{report.PrinterInfo.ConfiguredDefaultPrinter}' not found.");
            }
            else if (!defaultPrinter.IsValid)
            {
                report.Recommendations.Add($"Warning: Default printer '{report.PrinterInfo.ConfiguredDefaultPrinter}' is not in a valid state.");
            }
        }

        // Check Print Spooler service
        if (report.PrinterInfo.PrintSpoolerStatus != "Running")
        {
            report.Recommendations.Add("Critical: Print Spooler service is not running. Start the Print Spooler service.");
        }

        // Check admin privileges
        if (!report.SecurityInfo.HasAdminPrivileges)
        {
            report.Recommendations.Add("Warning: Service is not running with administrative privileges. Some operations may fail.");
        }
    }

    // Helper methods
    private DateTime GetBuildDate(System.Reflection.Assembly assembly)
    {
        try
        {
            var attribute = assembly.GetCustomAttribute<System.Reflection.AssemblyMetadataAttribute>();
            if (attribute?.Key == "BuildDate" && DateTime.TryParse(attribute.Value, out var buildDate))
            {
                return buildDate;
            }
        }
        catch
        {
            // Ignore errors
        }
        
        return File.GetCreationTime(assembly.Location);
    }

    private bool IsRunningAsWindowsService()
    {
        return !Environment.UserInteractive;
    }

    private string GetServiceAccount()
    {
        try
        {
            return WindowsIdentity.GetCurrent().Name;
        }
        catch
        {
            return "Unknown";
        }
    }

    private bool IsRunningWithAdminPrivileges()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    private async Task<string> CheckTempDirectoryPermissionsAsync()
    {
        try
        {
            var tempPath = Path.GetTempPath();
            var testFile = Path.Combine(tempPath, $"acchu_test_{Guid.NewGuid():N}.tmp");
            
            await File.WriteAllTextAsync(testFile, "test");
            File.Delete(testFile);
            
            return "Read/Write access confirmed";
        }
        catch (Exception ex)
        {
            return $"Access denied: {ex.Message}";
        }
    }

    private HealthCheckResult CheckTempDirectoryAccess()
    {
        try
        {
            var tempPath = Path.GetTempPath();
            if (!Directory.Exists(tempPath))
            {
                return new HealthCheckResult
                {
                    Name = "Temp Directory Access",
                    Status = "Failed",
                    Message = $"Temp directory does not exist: {tempPath}"
                };
            }

            return new HealthCheckResult
            {
                Name = "Temp Directory Access",
                Status = "Passed",
                Message = $"Temp directory accessible: {tempPath}"
            };
        }
        catch (Exception ex)
        {
            return new HealthCheckResult
            {
                Name = "Temp Directory Access",
                Status = "Failed",
                Message = ex.Message
            };
        }
    }

    private HealthCheckResult CheckDiskSpace()
    {
        try
        {
            var tempPath = Path.GetTempPath();
            var driveInfo = new DriveInfo(Path.GetPathRoot(tempPath) ?? "C:");
            var freeSpaceGB = driveInfo.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);

            var status = freeSpaceGB < 0.5 ? "Failed" : freeSpaceGB < 1.0 ? "Warning" : "Passed";
            
            return new HealthCheckResult
            {
                Name = "Disk Space",
                Status = status,
                Message = $"{freeSpaceGB:F1}GB available on {driveInfo.Name}"
            };
        }
        catch (Exception ex)
        {
            return new HealthCheckResult
            {
                Name = "Disk Space",
                Status = "Failed",
                Message = ex.Message
            };
        }
    }

    private HealthCheckResult CheckMemoryUsage()
    {
        try
        {
            var workingSet = Environment.WorkingSet;
            var workingSetMB = workingSet / (1024.0 * 1024.0);

            var status = workingSetMB > 500 ? "Warning" : "Passed";
            
            return new HealthCheckResult
            {
                Name = "Memory Usage",
                Status = status,
                Message = $"Working set: {workingSetMB:F0}MB"
            };
        }
        catch (Exception ex)
        {
            return new HealthCheckResult
            {
                Name = "Memory Usage",
                Status = "Failed",
                Message = ex.Message
            };
        }
    }

    private async Task<HealthCheckResult> CheckServiceDependenciesAsync()
    {
        try
        {
            var issues = new List<string>();

            // Check Print Spooler
            try
            {
                using var spoolerService = new ServiceController("Spooler");
                if (spoolerService.Status != ServiceControllerStatus.Running)
                {
                    issues.Add($"Print Spooler: {spoolerService.Status}");
                }
            }
            catch (Exception ex)
            {
                issues.Add($"Print Spooler: Error - {ex.Message}");
            }

            var status = issues.Count == 0 ? "Passed" : "Failed";
            var message = issues.Count == 0 ? "All dependencies running" : string.Join("; ", issues);

            return new HealthCheckResult
            {
                Name = "Service Dependencies",
                Status = status,
                Message = message
            };
        }
        catch (Exception ex)
        {
            return new HealthCheckResult
            {
                Name = "Service Dependencies",
                Status = "Failed",
                Message = ex.Message
            };
        }
    }
}

// Diagnostic report data structures
public class DiagnosticReport
{
    public DateTime Timestamp { get; set; }
    public ServiceVersionInfo ServiceVersion { get; set; } = new();
    public SystemInformation SystemInfo { get; set; } = new();
    public ServiceInformation ServiceInfo { get; set; } = new();
    public ConfigurationInformation ConfigurationInfo { get; set; } = new();
    public SecurityInformation SecurityInfo { get; set; } = new();
    public PrinterInformation PrinterInfo { get; set; } = new();
    public SessionInformation SessionInfo { get; set; } = new();
    public List<HealthCheckResult> HealthChecks { get; set; } = new();
    public SystemMetrics SystemMetrics { get; set; } = new();
    public List<string> Recommendations { get; set; } = new();
}

public class ServiceVersionInfo
{
    public string AssemblyVersion { get; set; } = string.Empty;
    public string FileVersion { get; set; } = string.Empty;
    public string ProductVersion { get; set; } = string.Empty;
    public DateTime BuildDate { get; set; }
}

public class SystemInformation
{
    public string MachineName { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string OSVersion { get; set; } = string.Empty;
    public int ProcessorCount { get; set; }
    public bool Is64BitOperatingSystem { get; set; }
    public bool Is64BitProcess { get; set; }
    public long WorkingSet { get; set; }
    public string SystemDirectory { get; set; } = string.Empty;
    public string CurrentDirectory { get; set; } = string.Empty;
    public string TempPath { get; set; } = string.Empty;
    public string UserDomainName { get; set; } = string.Empty;
    public bool IsUserInteractive { get; set; }
}

public class ServiceInformation
{
    public int ProcessId { get; set; }
    public string ProcessName { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
    public int ThreadCount { get; set; }
    public int HandleCount { get; set; }
    public long WorkingSet64 { get; set; }
    public long PrivateMemorySize64 { get; set; }
    public long VirtualMemorySize64 { get; set; }
    public bool IsRunningAsService { get; set; }
    public string ServiceAccount { get; set; } = string.Empty;
}

public class ConfigurationInformation
{
    public object SandboxConfig { get; set; } = new();
    public object PrintConfig { get; set; } = new();
    public object SecurityConfig { get; set; } = new();
}

public class SecurityInformation
{
    public string CurrentUser { get; set; } = string.Empty;
    public bool IsAuthenticated { get; set; }
    public string AuthenticationType { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public bool IsAnonymous { get; set; }
    public bool IsGuest { get; set; }
    public List<string> Groups { get; set; } = new();
    public bool HasAdminPrivileges { get; set; }
    public string TempDirectoryPermissions { get; set; } = string.Empty;
}

public class PrinterInformation
{
    public List<PrinterDetails> InstalledPrinters { get; set; } = new();
    public string PrintSpoolerStatus { get; set; } = string.Empty;
    public string ConfiguredDefaultPrinter { get; set; } = string.Empty;
}

public class PrinterDetails
{
    public string Name { get; set; } = string.Empty;
    public bool IsValid { get; set; }
    public bool IsDefaultPrinter { get; set; }
    public bool CanDuplex { get; set; }
    public bool SupportsColor { get; set; }
    public int MaximumCopies { get; set; }
    public string? Error { get; set; }
}

public class SessionInformation
{
    public int ActiveSessionCount { get; set; }
    public int TotalSessionsToday { get; set; }
    public TimeSpan AverageSessionDuration { get; set; }
}

public class HealthCheckResult
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}