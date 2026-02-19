using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AcchuSandboxEngine;

public class AcchuSandboxWorker : BackgroundService
{
    private readonly ILogger<AcchuSandboxWorker> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ICleanupManager _cleanupManager;
    private readonly ISecurityManager _securityManager;

    public AcchuSandboxWorker(
        ILogger<AcchuSandboxWorker> logger,
        ISessionManager sessionManager,
        ICleanupManager cleanupManager,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _cleanupManager = cleanupManager;
        _securityManager = securityManager;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ACCHU Sandbox Engine starting up...");

        try
        {
            // Perform startup cleanup of any orphaned sessions (Requirement 4.3)
            await PerformStartupCleanupAsync();

            _logger.LogInformation("ACCHU Sandbox Engine is ready");

            // Keep the service running with periodic maintenance
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                    
                    // Periodic health check and cleanup
                    await PerformPeriodicMaintenanceAsync();
                }
                catch (OperationCanceledException)
                {
                    // Expected when cancellation is requested
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during periodic maintenance");
                    
                    // Log security event for unexpected errors
                    try
                    {
                        await _securityManager.LogSecurityEventAsync(new Models.SecurityEvent
                        {
                            EventType = Models.SecurityEventType.SecurityViolation,
                            Description = "Unexpected error during periodic maintenance",
                            Timestamp = DateTime.UtcNow,
                            Details = new Dictionary<string, object> 
                            { 
                                { "ExceptionType", ex.GetType().Name },
                                { "ExceptionMessage", ex.Message }
                            }
                        });
                    }
                    catch (Exception logEx)
                    {
                        _logger.LogError(logEx, "Failed to log security event for maintenance error");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Critical error in ACCHU Sandbox Engine main loop");
            
            // Attempt emergency cleanup
            try
            {
                await PerformEmergencyCleanupAsync();
            }
            catch (Exception cleanupEx)
            {
                _logger.LogCritical(cleanupEx, "Emergency cleanup failed");
            }
            
            throw; // Re-throw to ensure service stops
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("ACCHU Sandbox Engine is stopping...");
        
        try
        {
            // Perform shutdown cleanup (Requirement 4.4)
            await PerformShutdownCleanupAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during shutdown cleanup");
        }
        
        await base.StopAsync(cancellationToken);
    }

    /// <summary>
    /// Performs startup cleanup of orphaned sessions from previous runs (Requirement 4.3)
    /// </summary>
    private async Task PerformStartupCleanupAsync()
    {
        try
        {
            _logger.LogInformation("Performing startup cleanup of orphaned sessions...");
            
            // Perform crash recovery through SessionManager
            if (_sessionManager is SessionManager sessionManager)
            {
                await sessionManager.PerformCrashRecoveryAsync();
            }
            
            // Additional system-level cleanup
            await PerformSystemLevelCleanupAsync();
            
            _logger.LogInformation("Startup cleanup completed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during startup cleanup");
            
            // Log security event
            try
            {
                await _securityManager.LogSecurityEventAsync(new Models.SecurityEvent
                {
                    EventType = Models.SecurityEventType.SecurityViolation,
                    Description = "Startup cleanup failed",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "ExceptionType", ex.GetType().Name },
                        { "ExceptionMessage", ex.Message }
                    }
                });
            }
            catch (Exception logEx)
            {
                _logger.LogError(logEx, "Failed to log startup cleanup error");
            }
        }
    }

    /// <summary>
    /// Performs periodic maintenance tasks including health checks and cleanup
    /// </summary>
    private async Task PerformPeriodicMaintenanceAsync()
    {
        try
        {
            _logger.LogDebug("Performing periodic maintenance");
            
            // Check system health
            await PerformHealthCheckAsync();
            
            // Clean up any temporary files that might have been missed
            await PerformTemporaryCleanupAsync();
            
            _logger.LogDebug("Periodic maintenance completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during periodic maintenance");
            throw; // Re-throw to be handled by caller
        }
    }

    /// <summary>
    /// Performs shutdown cleanup of all active sessions (Requirement 4.4)
    /// </summary>
    private async Task PerformShutdownCleanupAsync()
    {
        try
        {
            _logger.LogInformation("Performing shutdown cleanup...");
            
            // Get all active sessions
            List<string> activeSessions;
            if (_sessionManager is SessionManager sessionManager)
            {
                activeSessions = await sessionManager.GetActiveSessionIdsAsync();
            }
            else
            {
                activeSessions = new List<string>();
            }
            
            _logger.LogInformation("Found {Count} active sessions to clean up", activeSessions.Count);
            
            // Clean up each active session
            foreach (var sessionId in activeSessions)
            {
                try
                {
                    _logger.LogInformation("Cleaning up active session {SessionId} during shutdown", sessionId);
                    
                    // Invalidate the session
                    await _sessionManager.InvalidateSessionAsync(sessionId, "Service shutdown");
                    
                    // Perform full cleanup
                    var cleanupResult = await _cleanupManager.PerformFullCleanupAsync(sessionId);
                    if (!cleanupResult.Success)
                    {
                        _logger.LogError("Failed to cleanup session {SessionId} during shutdown: {Error}", 
                            sessionId, cleanupResult.ErrorMessage);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error cleaning up session {SessionId} during shutdown", sessionId);
                }
            }
            
            _logger.LogInformation("Shutdown cleanup completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during shutdown cleanup");
            throw; // Re-throw to ensure caller knows cleanup failed
        }
    }

    /// <summary>
    /// Performs system-level cleanup of any remaining artifacts
    /// </summary>
    private async Task PerformSystemLevelCleanupAsync()
    {
        try
        {
            _logger.LogDebug("Performing system-level cleanup");
            
            // Use a dummy session ID for system-level cleanup
            var systemCleanupSessionId = "system-cleanup-" + Guid.NewGuid().ToString("N")[..8];
            
            // Clear temporary caches
            var cacheCleanupResult = await _cleanupManager.ClearTemporaryCachesAsync(systemCleanupSessionId);
            if (!cacheCleanupResult.Success)
            {
                _logger.LogWarning("System-level cache cleanup had issues: {Error}", cacheCleanupResult.ErrorMessage);
            }
            
            // Clear print spooler of any orphaned jobs
            var spoolerCleanupResult = await _cleanupManager.ClearPrintSpoolerAsync(systemCleanupSessionId);
            if (!spoolerCleanupResult.Success)
            {
                _logger.LogWarning("System-level spooler cleanup had issues: {Error}", spoolerCleanupResult.ErrorMessage);
            }
            
            _logger.LogDebug("System-level cleanup completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during system-level cleanup");
        }
    }

    /// <summary>
    /// Performs health checks on system components
    /// </summary>
    private async Task PerformHealthCheckAsync()
    {
        try
        {
            _logger.LogDebug("Performing health check");
            
            // Check if temp directory is accessible
            var tempDir = Path.GetTempPath();
            if (!Directory.Exists(tempDir))
            {
                _logger.LogError("Temp directory {TempDir} is not accessible", tempDir);
                
                await _securityManager.LogSecurityEventAsync(new Models.SecurityEvent
                {
                    EventType = Models.SecurityEventType.SecurityViolation,
                    Description = "Temp directory not accessible during health check",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "TempDirectory", tempDir } }
                });
            }
            
            // Check disk space
            var driveInfo = new DriveInfo(Path.GetPathRoot(tempDir) ?? "C:");
            var freeSpaceGB = driveInfo.AvailableFreeSpace / (1024 * 1024 * 1024);
            
            if (freeSpaceGB < 1) // Less than 1GB free
            {
                _logger.LogWarning("Low disk space detected: {FreeSpaceGB}GB available", freeSpaceGB);
                
                await _securityManager.LogSecurityEventAsync(new Models.SecurityEvent
                {
                    EventType = Models.SecurityEventType.SecurityViolation,
                    Description = "Low disk space detected during health check",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "FreeSpaceGB", freeSpaceGB },
                        { "Drive", driveInfo.Name }
                    }
                });
            }
            
            _logger.LogDebug("Health check completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during health check");
        }
    }

    /// <summary>
    /// Performs cleanup of temporary files that might have been missed
    /// </summary>
    private async Task PerformTemporaryCleanupAsync()
    {
        try
        {
            _logger.LogDebug("Performing temporary cleanup");
            
            // Use a dummy session ID for temporary cleanup
            var tempCleanupSessionId = "temp-cleanup-" + Guid.NewGuid().ToString("N")[..8];
            
            // Clear temporary caches
            var cleanupResult = await _cleanupManager.ClearTemporaryCachesAsync(tempCleanupSessionId);
            if (!cleanupResult.Success)
            {
                _logger.LogDebug("Temporary cleanup had issues: {Error}", cleanupResult.ErrorMessage);
            }
            
            _logger.LogDebug("Temporary cleanup completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during temporary cleanup");
        }
    }

    /// <summary>
    /// Performs emergency cleanup when critical errors occur
    /// </summary>
    private async Task PerformEmergencyCleanupAsync()
    {
        try
        {
            _logger.LogWarning("Performing emergency cleanup");
            
            // Get all active sessions if possible
            List<string> activeSessions = new();
            try
            {
                if (_sessionManager is SessionManager sessionManager)
                {
                    activeSessions = await sessionManager.GetActiveSessionIdsAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get active sessions during emergency cleanup");
            }
            
            // Emergency cleanup of all sessions
            foreach (var sessionId in activeSessions)
            {
                try
                {
                    await _cleanupManager.PerformFullCleanupAsync(sessionId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed emergency cleanup for session {SessionId}", sessionId);
                }
            }
            
            // System-level emergency cleanup
            await PerformSystemLevelCleanupAsync();
            
            _logger.LogWarning("Emergency cleanup completed");
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Emergency cleanup failed");
        }
    }
}