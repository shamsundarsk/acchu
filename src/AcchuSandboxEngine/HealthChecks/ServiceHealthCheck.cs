using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using AcchuSandboxEngine.Interfaces;

namespace AcchuSandboxEngine;

/// <summary>
/// Health check for the core service functionality
/// </summary>
public class ServiceHealthCheck : IHealthCheck
{
    private readonly ILogger<ServiceHealthCheck> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;

    public ServiceHealthCheck(
        ILogger<ServiceHealthCheck> logger,
        ISessionManager sessionManager,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _securityManager = securityManager;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var healthData = new Dictionary<string, object>();

            // Check if core services are responsive
            var sessionStatus = _sessionManager.GetSessionStatus("health-check");
            healthData.Add("SessionManagerResponsive", sessionStatus != null);

            // Check if we can log security events (basic security manager test)
            try
            {
                await _securityManager.LogSecurityEventAsync(new Models.SecurityEvent
                {
                    EventType = Models.SecurityEventType.SessionStarted,
                    Description = "Health check test event",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "HealthCheck", true } }
                });
                healthData.Add("SecurityManagerResponsive", true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Security manager health check failed");
                healthData.Add("SecurityManagerResponsive", false);
                healthData.Add("SecurityManagerError", ex.Message);
            }

            // Check system resources
            var tempPath = Path.GetTempPath();
            healthData.Add("TempDirectoryAccessible", Directory.Exists(tempPath));

            // Check available memory
            var workingSet = Environment.WorkingSet;
            healthData.Add("WorkingSetBytes", workingSet);
            healthData.Add("WorkingSetMB", workingSet / (1024 * 1024));

            // Determine overall health status
            var isHealthy = (bool)healthData["SessionManagerResponsive"] &&
                           (bool)healthData["SecurityManagerResponsive"] &&
                           (bool)healthData["TempDirectoryAccessible"];

            if (isHealthy)
            {
                return HealthCheckResult.Healthy("Service is operating normally", healthData);
            }
            else
            {
                return HealthCheckResult.Degraded("Service has some issues but is operational", null, healthData);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Health check failed with exception");
            return HealthCheckResult.Unhealthy("Service health check failed", ex);
        }
    }
}