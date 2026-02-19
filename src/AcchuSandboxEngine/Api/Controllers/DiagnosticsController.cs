using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using AcchuSandboxEngine.Services;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Api.Controllers;

/// <summary>
/// Controller for system diagnostics and health monitoring
/// Provides comprehensive system information and health status
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize] // Require authentication for diagnostic endpoints
public class DiagnosticsController : ControllerBase
{
    private readonly ILogger<DiagnosticsController> _logger;
    private readonly DiagnosticsService _diagnosticsService;
    private readonly MonitoringService _monitoringService;
    private readonly ISecurityManager _securityManager;

    public DiagnosticsController(
        ILogger<DiagnosticsController> logger,
        DiagnosticsService diagnosticsService,
        MonitoringService monitoringService,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _diagnosticsService = diagnosticsService;
        _monitoringService = monitoringService;
        _securityManager = securityManager;
    }

    /// <summary>
    /// Gets basic health status
    /// </summary>
    [HttpGet("health")]
    public async Task<IActionResult> GetHealthStatus()
    {
        try
        {
            _logger.LogDebug("Health status requested");

            var systemMetrics = _monitoringService.GetSystemMetrics();
            var healthStatus = DetermineHealthStatus(systemMetrics);

            var response = new
            {
                Status = healthStatus,
                Timestamp = DateTime.UtcNow,
                ServiceName = "ACCHU Sandbox Engine",
                Version = GetServiceVersion(),
                Uptime = GetUptime(),
                SystemMetrics = new
                {
                    systemMetrics.ActiveSessions,
                    systemMetrics.CpuUsagePercent,
                    systemMetrics.AvailableMemoryMB,
                    systemMetrics.DiskFreeSpaceGB,
                    systemMetrics.ThreadCount
                }
            };

            // Log security event for health check access
            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Health status accessed via API",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RemoteIpAddress", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", Request.Headers.UserAgent.ToString() },
                    { "HealthStatus", healthStatus }
                }
            });

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting health status");
            return StatusCode(500, new { Error = "Failed to get health status", Message = ex.Message });
        }
    }

    /// <summary>
    /// Gets comprehensive diagnostic report
    /// </summary>
    [HttpGet("report")]
    public async Task<IActionResult> GetDiagnosticReport()
    {
        try
        {
            _logger.LogInformation("Comprehensive diagnostic report requested");

            var report = await _diagnosticsService.GenerateDiagnosticReportAsync();

            // Log security event for diagnostic report access
            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Comprehensive diagnostic report accessed via API",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RemoteIpAddress", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", Request.Headers.UserAgent.ToString() },
                    { "ReportTimestamp", report.Timestamp }
                }
            });

            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating diagnostic report");
            return StatusCode(500, new { Error = "Failed to generate diagnostic report", Message = ex.Message });
        }
    }

    /// <summary>
    /// Gets current system metrics
    /// </summary>
    [HttpGet("metrics")]
    public async Task<IActionResult> GetSystemMetrics()
    {
        try
        {
            _logger.LogDebug("System metrics requested");

            var metrics = _monitoringService.GetSystemMetrics();

            // Log security event for metrics access
            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "System metrics accessed via API",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RemoteIpAddress", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", Request.Headers.UserAgent.ToString() }
                }
            });

            return Ok(metrics);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting system metrics");
            return StatusCode(500, new { Error = "Failed to get system metrics", Message = ex.Message });
        }
    }

    /// <summary>
    /// Gets service configuration (sanitized)
    /// </summary>
    [HttpGet("config")]
    public async Task<IActionResult> GetConfiguration()
    {
        try
        {
            _logger.LogDebug("Configuration requested");

            var report = await _diagnosticsService.GenerateDiagnosticReportAsync();
            var config = report.ConfigurationInfo;

            // Log security event for configuration access
            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Service configuration accessed via API",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RemoteIpAddress", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", Request.Headers.UserAgent.ToString() }
                }
            });

            return Ok(config);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting configuration");
            return StatusCode(500, new { Error = "Failed to get configuration", Message = ex.Message });
        }
    }

    /// <summary>
    /// Performs a comprehensive health check
    /// </summary>
    [HttpPost("healthcheck")]
    public async Task<IActionResult> PerformHealthCheck()
    {
        try
        {
            _logger.LogInformation("Comprehensive health check requested");

            var report = await _diagnosticsService.GenerateDiagnosticReportAsync();
            var healthChecks = report.HealthChecks;
            var recommendations = report.Recommendations;

            var overallStatus = healthChecks.Any(hc => hc.Status == "Failed") ? "Failed" :
                               healthChecks.Any(hc => hc.Status == "Warning") ? "Warning" : "Passed";

            var response = new
            {
                OverallStatus = overallStatus,
                Timestamp = DateTime.UtcNow,
                HealthChecks = healthChecks,
                Recommendations = recommendations,
                SystemMetrics = report.SystemMetrics
            };

            // Log security event for health check
            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Comprehensive health check performed via API",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RemoteIpAddress", HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", Request.Headers.UserAgent.ToString() },
                    { "OverallStatus", overallStatus },
                    { "FailedChecks", healthChecks.Count(hc => hc.Status == "Failed") },
                    { "WarningChecks", healthChecks.Count(hc => hc.Status == "Warning") }
                }
            });

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error performing health check");
            return StatusCode(500, new { Error = "Failed to perform health check", Message = ex.Message });
        }
    }

    // Helper methods
    private string DetermineHealthStatus(SystemMetrics metrics)
    {
        if (metrics.DiskFreeSpaceGB < 0.5 || metrics.AvailableMemoryMB < 256)
        {
            return "Critical";
        }
        
        if (metrics.DiskFreeSpaceGB < 1.0 || metrics.AvailableMemoryMB < 512 || metrics.CpuUsagePercent > 80)
        {
            return "Warning";
        }
        
        return "Healthy";
    }

    private string GetServiceVersion()
    {
        try
        {
            var assembly = System.Reflection.Assembly.GetExecutingAssembly();
            return assembly.GetName().Version?.ToString() ?? "Unknown";
        }
        catch
        {
            return "Unknown";
        }
    }

    private TimeSpan GetUptime()
    {
        try
        {
            var process = System.Diagnostics.Process.GetCurrentProcess();
            return DateTime.Now - process.StartTime;
        }
        catch
        {
            return TimeSpan.Zero;
        }
    }
}