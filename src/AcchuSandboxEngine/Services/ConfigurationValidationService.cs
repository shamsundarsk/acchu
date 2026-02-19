using AcchuSandboxEngine.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using System.Security.Principal;
using System.IO;
using System.Text.RegularExpressions;

namespace AcchuSandboxEngine.Services;

/// <summary>
/// Service responsible for validating configuration settings at startup
/// </summary>
public class ConfigurationValidationService
{
    private readonly ILogger<ConfigurationValidationService> _logger;
    private readonly SandboxConfiguration _sandboxConfig;
    private readonly PrintConfiguration _printConfig;
    private readonly SecurityConfiguration _securityConfig;

    public ConfigurationValidationService(
        ILogger<ConfigurationValidationService> logger,
        IOptions<SandboxConfiguration> sandboxConfig,
        IOptions<PrintConfiguration> printConfig,
        IOptions<SecurityConfiguration> securityConfig)
    {
        _logger = logger;
        _sandboxConfig = sandboxConfig.Value;
        _printConfig = printConfig.Value;
        _securityConfig = securityConfig.Value;
    }

    /// <summary>
    /// Validates all configuration sections and returns validation results
    /// </summary>
    public async Task<ConfigurationValidationResult> ValidateConfigurationAsync()
    {
        var result = new ConfigurationValidationResult();
        
        _logger.LogInformation("Starting configuration validation...");

        // Validate sandbox configuration
        await ValidateSandboxConfigurationAsync(result);
        
        // Validate print configuration
        await ValidatePrintConfigurationAsync(result);
        
        // Validate security configuration
        await ValidateSecurityConfigurationAsync(result);
        
        // Validate system requirements
        await ValidateSystemRequirementsAsync(result);

        if (result.IsValid)
        {
            _logger.LogInformation("Configuration validation completed successfully");
        }
        else
        {
            _logger.LogError("Configuration validation failed with {ErrorCount} errors and {WarningCount} warnings", 
                result.Errors.Count, result.Warnings.Count);
        }

        return result;
    }

    private async Task ValidateSandboxConfigurationAsync(ConfigurationValidationResult result)
    {
        _logger.LogDebug("Validating sandbox configuration...");

        // Validate temp directory root
        if (string.IsNullOrWhiteSpace(_sandboxConfig.TempDirectoryRoot))
        {
            result.AddError("Sandbox.TempDirectoryRoot", "Temp directory root cannot be empty");
        }
        else
        {
            try
            {
                var expandedPath = Environment.ExpandEnvironmentVariables(_sandboxConfig.TempDirectoryRoot);
                var parentDir = Path.GetDirectoryName(expandedPath);
                
                if (!Directory.Exists(parentDir))
                {
                    result.AddError("Sandbox.TempDirectoryRoot", $"Parent directory does not exist: {parentDir}");
                }
                else if (!HasWritePermission(parentDir))
                {
                    result.AddError("Sandbox.TempDirectoryRoot", $"No write permission to parent directory: {parentDir}");
                }
            }
            catch (Exception ex)
            {
                result.AddError("Sandbox.TempDirectoryRoot", $"Invalid path format: {ex.Message}");
            }
        }

        // Validate session duration
        if (_sandboxConfig.MaxSessionDurationMinutes <= 0)
        {
            result.AddError("Sandbox.MaxSessionDurationMinutes", "Session duration must be greater than 0");
        }
        else if (_sandboxConfig.MaxSessionDurationMinutes > 1440) // 24 hours
        {
            result.AddWarning("Sandbox.MaxSessionDurationMinutes", "Session duration exceeds 24 hours, consider shorter duration for security");
        }

        // Validate file size limits
        if (_sandboxConfig.MaxFileSizeBytes <= 0)
        {
            result.AddError("Sandbox.MaxFileSizeBytes", "Max file size must be greater than 0");
        }
        else if (_sandboxConfig.MaxFileSizeBytes > 1073741824) // 1GB
        {
            result.AddWarning("Sandbox.MaxFileSizeBytes", "Max file size exceeds 1GB, consider smaller limit for performance");
        }

        // Validate allowed file types
        if (_sandboxConfig.AllowedFileTypes == null || !_sandboxConfig.AllowedFileTypes.Any())
        {
            result.AddError("Sandbox.AllowedFileTypes", "At least one file type must be allowed");
        }
        else
        {
            foreach (var fileType in _sandboxConfig.AllowedFileTypes)
            {
                if (!fileType.StartsWith(".") || fileType.Length < 2)
                {
                    result.AddError("Sandbox.AllowedFileTypes", $"Invalid file type format: {fileType}");
                }
            }
        }

        // Validate secure deletion passes
        if (_sandboxConfig.SecureDeletionPasses < 1)
        {
            result.AddError("Sandbox.SecureDeletionPasses", "Secure deletion passes must be at least 1");
        }
        else if (_sandboxConfig.SecureDeletionPasses > 10)
        {
            result.AddWarning("Sandbox.SecureDeletionPasses", "High number of deletion passes may impact performance");
        }

        // Validate service account
        if (string.IsNullOrWhiteSpace(_sandboxConfig.ServiceAccountName))
        {
            result.AddError("Sandbox.ServiceAccountName", "Service account name cannot be empty");
        }
        else if (!IsValidServiceAccount(_sandboxConfig.ServiceAccountName))
        {
            result.AddWarning("Sandbox.ServiceAccountName", "Service account format may be invalid");
        }

        await Task.CompletedTask;
    }

    private async Task ValidatePrintConfigurationAsync(ConfigurationValidationResult result)
    {
        _logger.LogDebug("Validating print configuration...");

        // Validate max copies
        if (_printConfig.MaxCopiesAllowed <= 0)
        {
            result.AddError("Print.MaxCopiesAllowed", "Max copies must be greater than 0");
        }
        else if (_printConfig.MaxCopiesAllowed > 100)
        {
            result.AddWarning("Print.MaxCopiesAllowed", "High copy limit may lead to resource exhaustion");
        }

        // Validate print timeout
        if (_printConfig.PrintTimeoutSeconds <= 0)
        {
            result.AddError("Print.PrintTimeoutSeconds", "Print timeout must be greater than 0");
        }
        else if (_printConfig.PrintTimeoutSeconds < 30)
        {
            result.AddWarning("Print.PrintTimeoutSeconds", "Short print timeout may cause premature job cancellation");
        }

        // Validate default printer if specified
        if (!string.IsNullOrWhiteSpace(_printConfig.DefaultPrinterName))
        {
            try
            {
                var printers = System.Drawing.Printing.PrinterSettings.InstalledPrinters;
                if (!printers.Cast<string>().Contains(_printConfig.DefaultPrinterName))
                {
                    result.AddWarning("Print.DefaultPrinterName", $"Default printer '{_printConfig.DefaultPrinterName}' is not installed");
                }
            }
            catch (Exception ex)
            {
                result.AddWarning("Print.DefaultPrinterName", $"Could not validate printer: {ex.Message}");
            }
        }

        await Task.CompletedTask;
    }

    private async Task ValidateSecurityConfigurationAsync(ConfigurationValidationResult result)
    {
        _logger.LogDebug("Validating security configuration...");

        // Validate JWT secret key
        if (string.IsNullOrWhiteSpace(_securityConfig.JwtSecretKey))
        {
            result.AddError("Security.JwtSecretKey", "JWT secret key cannot be empty");
        }
        else if (_securityConfig.JwtSecretKey.Contains("CHANGE-THIS") || _securityConfig.JwtSecretKey.Contains("PRODUCTION-KEY"))
        {
            result.AddError("Security.JwtSecretKey", "JWT secret key must be changed from default value");
        }
        else if (_securityConfig.JwtSecretKey.Length < 32)
        {
            result.AddError("Security.JwtSecretKey", "JWT secret key must be at least 32 characters for security");
        }

        // Validate JWT issuer and audience
        if (string.IsNullOrWhiteSpace(_securityConfig.JwtIssuer))
        {
            result.AddError("Security.JwtIssuer", "JWT issuer cannot be empty");
        }

        if (string.IsNullOrWhiteSpace(_securityConfig.JwtAudience))
        {
            result.AddError("Security.JwtAudience", "JWT audience cannot be empty");
        }

        // Validate token expiration
        if (_securityConfig.TokenExpirationMinutes <= 0)
        {
            result.AddError("Security.TokenExpirationMinutes", "Token expiration must be greater than 0");
        }
        else if (_securityConfig.TokenExpirationMinutes > 1440) // 24 hours
        {
            result.AddWarning("Security.TokenExpirationMinutes", "Long token expiration may pose security risk");
        }

        // Validate expected file source
        if (string.IsNullOrWhiteSpace(_securityConfig.ExpectedFileSource))
        {
            result.AddError("Security.ExpectedFileSource", "Expected file source cannot be empty");
        }

        // Validate security log path
        if (_securityConfig.EnableSecurityEventLogging && !string.IsNullOrWhiteSpace(_securityConfig.SecurityLogPath))
        {
            try
            {
                var expandedPath = Environment.ExpandEnvironmentVariables(_securityConfig.SecurityLogPath);
                var parentDir = Path.GetDirectoryName(expandedPath);
                
                if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
                {
                    // Try to create the directory
                    Directory.CreateDirectory(parentDir);
                    result.AddInfo("Security.SecurityLogPath", $"Created security log directory: {parentDir}");
                }
            }
            catch (Exception ex)
            {
                result.AddWarning("Security.SecurityLogPath", $"Could not validate/create security log path: {ex.Message}");
            }
        }

        // Validate allowed and restricted actions
        if (_securityConfig.AllowedActions == null || !_securityConfig.AllowedActions.Any())
        {
            result.AddError("Security.AllowedActions", "At least one action must be allowed");
        }

        if (_securityConfig.RestrictedActions == null || !_securityConfig.RestrictedActions.Any())
        {
            result.AddWarning("Security.RestrictedActions", "No actions are restricted, consider adding restrictions for security");
        }

        await Task.CompletedTask;
    }

    private async Task ValidateSystemRequirementsAsync(ConfigurationValidationResult result)
    {
        _logger.LogDebug("Validating system requirements...");

        // Check Windows version
        var osVersion = Environment.OSVersion;
        if (osVersion.Platform != PlatformID.Win32NT)
        {
            result.AddError("System.Platform", "This service requires Windows operating system");
        }
        else if (osVersion.Version.Major < 10)
        {
            result.AddWarning("System.WindowsVersion", "Windows 10 or later is recommended for optimal security features");
        }

        // Check if running as service or with appropriate privileges
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            
            if (!principal.IsInRole(WindowsBuiltInRole.Administrator) && 
                !identity.Name.Contains("LOCAL SERVICE") && 
                !identity.Name.Contains("NETWORK SERVICE"))
            {
                result.AddWarning("System.Privileges", "Service should run with appropriate service account privileges");
            }
        }
        catch (Exception ex)
        {
            result.AddWarning("System.Privileges", $"Could not validate current privileges: {ex.Message}");
        }

        // Check Print Spooler service
        try
        {
            var spoolerService = System.ServiceProcess.ServiceController.GetServices()
                .FirstOrDefault(s => s.ServiceName.Equals("Spooler", StringComparison.OrdinalIgnoreCase));
            
            if (spoolerService == null)
            {
                result.AddError("System.PrintSpooler", "Print Spooler service is not available");
            }
            else if (spoolerService.Status != System.ServiceProcess.ServiceControllerStatus.Running)
            {
                result.AddWarning("System.PrintSpooler", "Print Spooler service is not running");
            }
        }
        catch (Exception ex)
        {
            result.AddWarning("System.PrintSpooler", $"Could not check Print Spooler status: {ex.Message}");
        }

        // Check available disk space
        try
        {
            var tempPath = Environment.ExpandEnvironmentVariables(_sandboxConfig.TempDirectoryRoot);
            var drive = new DriveInfo(Path.GetPathRoot(tempPath) ?? "C:");
            
            var availableSpaceGB = drive.AvailableFreeSpace / (1024 * 1024 * 1024);
            if (availableSpaceGB < 1)
            {
                result.AddError("System.DiskSpace", $"Insufficient disk space: {availableSpaceGB:F1}GB available");
            }
            else if (availableSpaceGB < 5)
            {
                result.AddWarning("System.DiskSpace", $"Low disk space: {availableSpaceGB:F1}GB available");
            }
        }
        catch (Exception ex)
        {
            result.AddWarning("System.DiskSpace", $"Could not check disk space: {ex.Message}");
        }

        await Task.CompletedTask;
    }

    private static bool HasWritePermission(string path)
    {
        try
        {
            var testFile = Path.Combine(path, $"test_{Guid.NewGuid()}.tmp");
            File.WriteAllText(testFile, "test");
            File.Delete(testFile);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsValidServiceAccount(string accountName)
    {
        // Check for common service account patterns
        var validPatterns = new[]
        {
            @"^NT AUTHORITY\\(LOCAL SERVICE|NETWORK SERVICE|SYSTEM)$",
            @"^[A-Za-z0-9\-_\.]+\\[A-Za-z0-9\-_\.]+$", // Domain\User format
            @"^[A-Za-z0-9\-_\.]+@[A-Za-z0-9\-_\.]+$"   // UPN format
        };

        return validPatterns.Any(pattern => Regex.IsMatch(accountName, pattern, RegexOptions.IgnoreCase));
    }
}

/// <summary>
/// Result of configuration validation
/// </summary>
public class ConfigurationValidationResult
{
    public List<ConfigurationValidationItem> Errors { get; } = new();
    public List<ConfigurationValidationItem> Warnings { get; } = new();
    public List<ConfigurationValidationItem> Info { get; } = new();

    public bool IsValid => !Errors.Any();

    public void AddError(string section, string message)
    {
        Errors.Add(new ConfigurationValidationItem(section, message, ConfigurationValidationLevel.Error));
    }

    public void AddWarning(string section, string message)
    {
        Warnings.Add(new ConfigurationValidationItem(section, message, ConfigurationValidationLevel.Warning));
    }

    public void AddInfo(string section, string message)
    {
        Info.Add(new ConfigurationValidationItem(section, message, ConfigurationValidationLevel.Info));
    }
}

/// <summary>
/// Individual configuration validation item
/// </summary>
public class ConfigurationValidationItem
{
    public string Section { get; }
    public string Message { get; }
    public ConfigurationValidationLevel Level { get; }

    public ConfigurationValidationItem(string section, string message, ConfigurationValidationLevel level)
    {
        Section = section;
        Message = message;
        Level = level;
    }
}

/// <summary>
/// Configuration validation levels
/// </summary>
public enum ConfigurationValidationLevel
{
    Info,
    Warning,
    Error
}