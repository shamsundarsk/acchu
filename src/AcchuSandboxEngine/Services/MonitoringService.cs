using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using System.Diagnostics;
using System.Collections.Concurrent;

namespace AcchuSandboxEngine.Services;

/// <summary>
/// Service for comprehensive monitoring and diagnostics of the ACCHU Sandbox Engine
/// Provides real-time metrics, performance monitoring, and system health tracking
/// </summary>
public class MonitoringService : BackgroundService
{
    private readonly ILogger<MonitoringService> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;
    private readonly ConcurrentDictionary<string, SessionMetrics> _sessionMetrics;
    private readonly Timer _metricsTimer;
    private readonly PerformanceCounter? _cpuCounter;
    private readonly PerformanceCounter? _memoryCounter;

    public MonitoringService(
        ILogger<MonitoringService> logger,
        ISessionManager sessionManager,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _securityManager = securityManager;
        _sessionMetrics = new ConcurrentDictionary<string, SessionMetrics>();

        // Initialize performance counters
        try
        {
            _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
            _memoryCounter = new PerformanceCounter("Memory", "Available MBytes");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to initialize performance counters");
        }

        // Start metrics collection timer (every 30 seconds)
        _metricsTimer = new Timer(CollectMetrics, null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Monitoring service started");

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                
                // Perform periodic health assessment
                await PerformHealthAssessmentAsync();
            }
        }
        catch (OperationCanceledException)
        {
            // Expected when cancellation is requested
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in monitoring service execution");
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Monitoring service stopping");
        
        _metricsTimer?.Dispose();
        _cpuCounter?.Dispose();
        _memoryCounter?.Dispose();
        
        await base.StopAsync(cancellationToken);
    }

    /// <summary>
    /// Records session start metrics
    /// </summary>
    public void RecordSessionStart(string sessionId)
    {
        var metrics = new SessionMetrics
        {
            SessionId = sessionId,
            StartTime = DateTime.UtcNow,
            FilesProcessed = 0,
            PrintJobsSubmitted = 0,
            BytesProcessed = 0
        };

        _sessionMetrics.TryAdd(sessionId, metrics);
        _logger.LogDebug("Started tracking metrics for session {SessionId}", sessionId);
    }

    /// <summary>
    /// Records file processing metrics
    /// </summary>
    public void RecordFileProcessed(string sessionId, long fileSize)
    {
        if (_sessionMetrics.TryGetValue(sessionId, out var metrics))
        {
            lock (metrics)
            {
                metrics.FilesProcessed++;
                metrics.BytesProcessed += fileSize;
            }
            _logger.LogDebug("Recorded file processing for session {SessionId}: {FileSize} bytes", sessionId, fileSize);
        }
    }

    /// <summary>
    /// Records print job submission metrics
    /// </summary>
    public void RecordPrintJobSubmitted(string sessionId)
    {
        if (_sessionMetrics.TryGetValue(sessionId, out var metrics))
        {
            lock (metrics)
            {
                metrics.PrintJobsSubmitted++;
            }
            _logger.LogDebug("Recorded print job submission for session {SessionId}", sessionId);
        }
    }

    /// <summary>
    /// Records session end and calculates final metrics
    /// </summary>
    public async Task RecordSessionEndAsync(string sessionId)
    {
        if (_sessionMetrics.TryRemove(sessionId, out var metrics))
        {
            metrics.EndTime = DateTime.UtcNow;
            var duration = metrics.EndTime.Value - metrics.StartTime;

            // Log comprehensive session metrics
            _logger.LogInformation(
                "Session {SessionId} completed - Duration: {Duration}, Files: {FilesProcessed}, " +
                "Print Jobs: {PrintJobsSubmitted}, Bytes: {BytesProcessed}",
                sessionId, duration, metrics.FilesProcessed, metrics.PrintJobsSubmitted, metrics.BytesProcessed);

            // Log security event with session metrics
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SessionEnded,
                Description = "Session completed with metrics",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "Duration", duration.TotalSeconds },
                    { "FilesProcessed", metrics.FilesProcessed },
                    { "PrintJobsSubmitted", metrics.PrintJobsSubmitted },
                    { "BytesProcessed", metrics.BytesProcessed },
                    { "AverageFileSize", metrics.FilesProcessed > 0 ? metrics.BytesProcessed / metrics.FilesProcessed : 0 }
                }
            });
        }
    }

    /// <summary>
    /// Gets current system metrics
    /// </summary>
    public SystemMetrics GetSystemMetrics()
    {
        var metrics = new SystemMetrics
        {
            Timestamp = DateTime.UtcNow,
            ActiveSessions = _sessionMetrics.Count,
            ProcessId = Environment.ProcessId,
            WorkingSetBytes = Environment.WorkingSet,
            ThreadCount = Process.GetCurrentProcess().Threads.Count
        };

        try
        {
            if (_cpuCounter != null)
            {
                metrics.CpuUsagePercent = _cpuCounter.NextValue();
            }

            if (_memoryCounter != null)
            {
                metrics.AvailableMemoryMB = _memoryCounter.NextValue();
            }

            var tempPath = Path.GetTempPath();
            var driveInfo = new DriveInfo(Path.GetPathRoot(tempPath) ?? "C:");
            metrics.DiskFreeSpaceGB = driveInfo.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting system metrics");
        }

        return metrics;
    }

    /// <summary>
    /// Collects and logs system metrics periodically
    /// </summary>
    private void CollectMetrics(object? state)
    {
        try
        {
            var systemMetrics = GetSystemMetrics();
            
            _logger.LogDebug(
                "System Metrics - Active Sessions: {ActiveSessions}, CPU: {CpuUsage:F1}%, " +
                "Memory: {AvailableMemory:F0}MB, Disk: {DiskSpace:F1}GB, Threads: {ThreadCount}",
                systemMetrics.ActiveSessions, systemMetrics.CpuUsagePercent, 
                systemMetrics.AvailableMemoryMB, systemMetrics.DiskFreeSpaceGB, systemMetrics.ThreadCount);

            // Log warning if resources are running low
            if (systemMetrics.AvailableMemoryMB < 512) // Less than 512MB available
            {
                _logger.LogWarning("Low memory detected: {AvailableMemory:F0}MB available", systemMetrics.AvailableMemoryMB);
            }

            if (systemMetrics.DiskFreeSpaceGB < 1.0) // Less than 1GB available
            {
                _logger.LogWarning("Low disk space detected: {DiskSpace:F1}GB available", systemMetrics.DiskFreeSpaceGB);
            }

            if (systemMetrics.CpuUsagePercent > 80) // CPU usage over 80%
            {
                _logger.LogWarning("High CPU usage detected: {CpuUsage:F1}%", systemMetrics.CpuUsagePercent);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error collecting metrics");
        }
    }

    /// <summary>
    /// Performs comprehensive health assessment
    /// </summary>
    private async Task PerformHealthAssessmentAsync()
    {
        try
        {
            _logger.LogDebug("Performing health assessment");

            var systemMetrics = GetSystemMetrics();
            var healthStatus = "Healthy";
            var issues = new List<string>();

            // Check for resource issues
            if (systemMetrics.AvailableMemoryMB < 256)
            {
                healthStatus = "Critical";
                issues.Add($"Critical memory shortage: {systemMetrics.AvailableMemoryMB:F0}MB available");
            }
            else if (systemMetrics.AvailableMemoryMB < 512)
            {
                healthStatus = "Warning";
                issues.Add($"Low memory: {systemMetrics.AvailableMemoryMB:F0}MB available");
            }

            if (systemMetrics.DiskFreeSpaceGB < 0.5)
            {
                healthStatus = "Critical";
                issues.Add($"Critical disk space shortage: {systemMetrics.DiskFreeSpaceGB:F1}GB available");
            }
            else if (systemMetrics.DiskFreeSpaceGB < 1.0)
            {
                if (healthStatus != "Critical") healthStatus = "Warning";
                issues.Add($"Low disk space: {systemMetrics.DiskFreeSpaceGB:F1}GB available");
            }

            if (systemMetrics.CpuUsagePercent > 90)
            {
                if (healthStatus != "Critical") healthStatus = "Warning";
                issues.Add($"High CPU usage: {systemMetrics.CpuUsagePercent:F1}%");
            }

            // Check for long-running sessions
            var longRunningSessions = _sessionMetrics.Values
                .Where(m => DateTime.UtcNow - m.StartTime > TimeSpan.FromHours(1))
                .ToList();

            if (longRunningSessions.Any())
            {
                if (healthStatus != "Critical") healthStatus = "Warning";
                issues.Add($"{longRunningSessions.Count} session(s) running over 1 hour");
            }

            // Log health assessment
            if (healthStatus == "Healthy")
            {
                _logger.LogDebug("Health assessment: System is healthy");
            }
            else
            {
                var logLevel = healthStatus == "Critical" ? LogLevel.Error : LogLevel.Warning;
                _logger.Log(logLevel, "Health assessment: {Status} - Issues: {Issues}", 
                    healthStatus, string.Join("; ", issues));

                // Log security event for health issues
                await _securityManager.LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = $"System health assessment: {healthStatus}",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object>
                    {
                        { "HealthStatus", healthStatus },
                        { "Issues", issues },
                        { "SystemMetrics", systemMetrics }
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during health assessment");
        }
    }
}

/// <summary>
/// Metrics for individual sessions
/// </summary>
public class SessionMetrics
{
    public string SessionId { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public long FilesProcessed { get; set; }
    public long PrintJobsSubmitted { get; set; }
    public long BytesProcessed { get; set; }
}

/// <summary>
/// System-wide metrics
/// </summary>
public class SystemMetrics
{
    public DateTime Timestamp { get; set; }
    public int ActiveSessions { get; set; }
    public int ProcessId { get; set; }
    public long WorkingSetBytes { get; set; }
    public int ThreadCount { get; set; }
    public float CpuUsagePercent { get; set; }
    public float AvailableMemoryMB { get; set; }
    public double DiskFreeSpaceGB { get; set; }
}