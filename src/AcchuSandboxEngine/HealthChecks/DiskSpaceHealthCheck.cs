using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AcchuSandboxEngine.Configuration;

namespace AcchuSandboxEngine;

/// <summary>
/// Health check for disk space availability
/// </summary>
public class DiskSpaceHealthCheck : IHealthCheck
{
    private readonly ILogger<DiskSpaceHealthCheck> _logger;
    private readonly SandboxConfiguration _sandboxConfig;

    public DiskSpaceHealthCheck(
        ILogger<DiskSpaceHealthCheck> logger,
        IOptions<SandboxConfiguration> sandboxConfig)
    {
        _logger = logger;
        _sandboxConfig = sandboxConfig.Value;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var healthData = new Dictionary<string, object>();

            // Get the temp directory path
            var tempPath = Environment.ExpandEnvironmentVariables(_sandboxConfig.TempDirectoryRoot);
            var rootPath = Path.GetPathRoot(tempPath) ?? "C:";
            
            healthData.Add("TempDirectoryRoot", tempPath);
            healthData.Add("CheckedDrive", rootPath);

            // Check disk space
            var driveInfo = new DriveInfo(rootPath);
            var freeSpaceBytes = driveInfo.AvailableFreeSpace;
            var totalSpaceBytes = driveInfo.TotalSize;
            var freeSpaceGB = freeSpaceBytes / (1024.0 * 1024.0 * 1024.0);
            var totalSpaceGB = totalSpaceBytes / (1024.0 * 1024.0 * 1024.0);
            var freeSpacePercentage = (double)freeSpaceBytes / totalSpaceBytes * 100;

            healthData.Add("FreeSpaceBytes", freeSpaceBytes);
            healthData.Add("TotalSpaceBytes", totalSpaceBytes);
            healthData.Add("FreeSpaceGB", Math.Round(freeSpaceGB, 2));
            healthData.Add("TotalSpaceGB", Math.Round(totalSpaceGB, 2));
            healthData.Add("FreeSpacePercentage", Math.Round(freeSpacePercentage, 1));

            // Determine health status based on available space
            if (freeSpaceGB < 0.5) // Less than 500MB
            {
                return Task.FromResult(HealthCheckResult.Unhealthy(
                    $"Critical: Only {freeSpaceGB:F2}GB free space available on {rootPath}", 
                    data: healthData));
            }
            else if (freeSpaceGB < 1.0) // Less than 1GB
            {
                return Task.FromResult(HealthCheckResult.Degraded(
                    $"Warning: Only {freeSpaceGB:F2}GB free space available on {rootPath}", 
                    data: healthData));
            }
            else if (freeSpacePercentage < 5) // Less than 5% free
            {
                return Task.FromResult(HealthCheckResult.Degraded(
                    $"Warning: Only {freeSpacePercentage:F1}% free space available on {rootPath}", 
                    data: healthData));
            }
            else
            {
                return Task.FromResult(HealthCheckResult.Healthy(
                    $"Sufficient disk space: {freeSpaceGB:F2}GB ({freeSpacePercentage:F1}%) available on {rootPath}", 
                    healthData));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Disk space health check failed");
            return Task.FromResult(HealthCheckResult.Unhealthy("Failed to check disk space", ex));
        }
    }
}