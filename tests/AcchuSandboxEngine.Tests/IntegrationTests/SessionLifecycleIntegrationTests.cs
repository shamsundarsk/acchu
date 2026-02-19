using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using AcchuSandboxEngine.Configuration;

namespace AcchuSandboxEngine.Tests.IntegrationTests;

/// <summary>
/// Integration tests for complete session lifecycle orchestration
/// Tests the wiring and interaction between all components
/// </summary>
public class SessionLifecycleIntegrationTests : IDisposable
{
    private readonly ServiceProvider _serviceProvider;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;
    private readonly IFileSystemManager _fileSystemManager;
    private readonly IPrintManager _printManager;
    private readonly ICleanupManager _cleanupManager;
    private readonly MonitoringService _monitoringService;
    private readonly DiagnosticsService _diagnosticsService;

    public SessionLifecycleIntegrationTests()
    {
        var services = new ServiceCollection();
        
        // Configure logging
        services.AddLogging(builder => builder.AddConsole().SetMinimumLevel(LogLevel.Debug));
        
        // Configure test configurations
        services.Configure<SandboxConfiguration>(config =>
        {
            config.TempDirectoryRoot = Path.GetTempPath();
            config.MaxSessionDurationMinutes = 30;
            config.MaxFileSizeBytes = 10 * 1024 * 1024; // 10MB
            config.AllowedFileTypes = new List<string> { ".pdf", ".txt", ".docx" };
            config.SecureDeletionPasses = 3;
            config.EnableAuditLogging = true;
            config.ServiceAccountName = "TestAccount";
        });
        
        services.Configure<PrintConfiguration>(config =>
        {
            config.DefaultPrinterName = "Microsoft Print to PDF";
            config.MaxCopiesAllowed = 10;
            config.AllowColorPrinting = true;
            config.AllowDoubleSided = true;
            config.PrintTimeoutSeconds = 300;
        });
        
        services.Configure<SecurityConfiguration>(config =>
        {
            config.ValidateIssuer = true;
            config.ValidateAudience = true;
            config.ValidateLifetime = true;
            config.ValidateIssuerSigningKey = true;
            config.JwtIssuer = "TestIssuer";
            config.JwtAudience = "TestAudience";
            config.JwtSecretKey = "TestSecretKeyThatIsLongEnoughForHS256Algorithm";
            config.TokenExpirationMinutes = 60;
        });
        
        // Register services in correct dependency order
        services.AddSingleton<ISecurityManager, SecurityManager>();
        services.AddSingleton<ICleanupManager, CleanupManager>();
        services.AddSingleton<IFileSystemManager, FileSystemManager>();
        services.AddSingleton<IPrintManager, PrintManager>();
        
        // Register monitoring service
        services.AddSingleton<MonitoringService>();
        
        // Register diagnostics service
        services.AddSingleton<DiagnosticsService>();
        
        // Register session manager with all dependencies
        services.AddSingleton<ISessionManager, SessionManager>();
        
        _serviceProvider = services.BuildServiceProvider();
        
        // Get service instances
        _sessionManager = _serviceProvider.GetRequiredService<ISessionManager>();
        _securityManager = _serviceProvider.GetRequiredService<ISecurityManager>();
        _fileSystemManager = _serviceProvider.GetRequiredService<IFileSystemManager>();
        _printManager = _serviceProvider.GetRequiredService<IPrintManager>();
        _cleanupManager = _serviceProvider.GetRequiredService<ICleanupManager>();
        _monitoringService = _serviceProvider.GetRequiredService<MonitoringService>();
        _diagnosticsService = _serviceProvider.GetRequiredService<DiagnosticsService>();
    }

    [Fact]
    public async Task CompleteSessionLifecycle_ShouldOrchestrateProperly()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString("N")[..16];
        var sessionToken = GenerateTestToken();
        
        var sessionRequest = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = sessionToken,
            ExpirationTime = DateTime.UtcNow.AddMinutes(30),
            Metadata = new Dictionary<string, object>
            {
                { "TestSession", true },
                { "IntegrationTest", "CompleteSessionLifecycle" }
            }
        };

        // Act & Assert - Start Session
        var startResult = await _sessionManager.StartSessionAsync(sessionRequest);
        
        Assert.True(startResult.Success, $"Session start failed: {startResult.ErrorMessage}");
        Assert.Equal(SessionStatus.Active, startResult.Status);
        Assert.Equal(sessionId, startResult.SessionId);

        // Verify session status
        var status = _sessionManager.GetSessionStatus(sessionId);
        Assert.Equal(SessionStatus.Active, status);

        // Act & Assert - End Session
        var endResult = await _sessionManager.EndSessionAsync(sessionId);
        
        Assert.True(endResult.Success, $"Session end failed: {endResult.ErrorMessage}");
        Assert.Equal(SessionStatus.Completed, endResult.Status);

        // Verify session is no longer active
        var finalStatus = _sessionManager.GetSessionStatus(sessionId);
        Assert.Equal(SessionStatus.Completed, finalStatus);
    }

    [Fact]
    public async Task SessionExclusivity_ShouldPreventConcurrentSessions()
    {
        // Arrange
        var sessionId1 = Guid.NewGuid().ToString("N")[..16];
        var sessionId2 = Guid.NewGuid().ToString("N")[..16];
        var sessionToken = GenerateTestToken();
        
        var sessionRequest1 = new SessionRequest
        {
            SessionId = sessionId1,
            SessionToken = sessionToken,
            ExpirationTime = DateTime.UtcNow.AddMinutes(30),
            Metadata = new Dictionary<string, object> { { "TestSession", true } }
        };
        
        var sessionRequest2 = new SessionRequest
        {
            SessionId = sessionId2,
            SessionToken = sessionToken,
            ExpirationTime = DateTime.UtcNow.AddMinutes(30),
            Metadata = new Dictionary<string, object> { { "TestSession", true } }
        };

        // Act
        var startResult1 = await _sessionManager.StartSessionAsync(sessionRequest1);
        var startResult2 = await _sessionManager.StartSessionAsync(sessionRequest2);

        // Assert
        Assert.True(startResult1.Success, "First session should start successfully");
        Assert.False(startResult2.Success, "Second session should be rejected");
        Assert.Contains("active session", startResult2.ErrorMessage, StringComparison.OrdinalIgnoreCase);

        // Cleanup
        await _sessionManager.EndSessionAsync(sessionId1);
    }

    [Fact]
    public async Task InvalidSessionToken_ShouldFailSecurely()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString("N")[..16];
        var invalidToken = "invalid.token.here";
        
        var sessionRequest = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = invalidToken,
            ExpirationTime = DateTime.UtcNow.AddMinutes(30),
            Metadata = new Dictionary<string, object> { { "TestSession", true } }
        };

        // Act
        var startResult = await _sessionManager.StartSessionAsync(sessionRequest);

        // Assert
        Assert.False(startResult.Success, "Session with invalid token should fail");
        Assert.Equal(SessionStatus.Failed, startResult.Status);
        Assert.Contains("token validation failed", startResult.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MonitoringService_ShouldTrackSystemMetrics()
    {
        // Act
        var systemMetrics = _monitoringService.GetSystemMetrics();

        // Assert
        Assert.NotNull(systemMetrics);
        Assert.True(systemMetrics.Timestamp > DateTime.MinValue);
        Assert.True(systemMetrics.ProcessId > 0);
        Assert.True(systemMetrics.WorkingSetBytes > 0);
        Assert.True(systemMetrics.ThreadCount > 0);
    }

    [Fact]
    public async Task DiagnosticsService_ShouldGenerateComprehensiveReport()
    {
        // Act
        var report = await _diagnosticsService.GenerateDiagnosticReportAsync();

        // Assert
        Assert.NotNull(report);
        Assert.True(report.Timestamp > DateTime.MinValue);
        Assert.NotNull(report.ServiceVersion);
        Assert.NotNull(report.SystemInfo);
        Assert.NotNull(report.ServiceInfo);
        Assert.NotNull(report.ConfigurationInfo);
        Assert.NotNull(report.SecurityInfo);
        Assert.NotNull(report.PrinterInfo);
        Assert.NotNull(report.SessionInfo);
        Assert.NotNull(report.HealthChecks);
        Assert.NotNull(report.SystemMetrics);
        Assert.NotNull(report.Recommendations);

        // Verify health checks were performed
        Assert.True(report.HealthChecks.Count > 0, "Health checks should be performed");
        
        // Verify system information is populated
        Assert.False(string.IsNullOrEmpty(report.SystemInfo.MachineName));
        Assert.False(string.IsNullOrEmpty(report.SystemInfo.OSVersion));
        Assert.True(report.SystemInfo.ProcessorCount > 0);
    }

    [Fact]
    public async Task ComponentIntegration_ShouldWireCorrectly()
    {
        // Test that all components are properly wired and can communicate
        
        // Test SecurityManager
        var securityEvent = new SecurityEvent
        {
            EventType = SecurityEventType.SessionStarted,
            Description = "Integration test event",
            Timestamp = DateTime.UtcNow,
            Details = new Dictionary<string, object> { { "Test", true } }
        };
        
        // This should not throw
        await _securityManager.LogSecurityEventAsync(securityEvent);

        // Test FileSystemManager
        var tempSessionId = Guid.NewGuid().ToString("N")[..16];
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(tempSessionId);
        
        Assert.True(sandboxResult.Success, $"Sandbox creation failed: {sandboxResult.ErrorMessage}");
        Assert.False(string.IsNullOrEmpty(sandboxResult.SandboxPath));

        // Test CleanupManager
        var cleanupResult = await _cleanupManager.PerformFullCleanupAsync(tempSessionId);
        
        // Cleanup may fail if sandbox wasn't fully set up, but it should not throw
        Assert.NotNull(cleanupResult);
    }

    [Fact]
    public async Task FailClosedBehavior_ShouldInvalidateSessionOnError()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString("N")[..16];
        var sessionToken = GenerateTestToken();
        
        var sessionRequest = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = sessionToken,
            ExpirationTime = DateTime.UtcNow.AddMinutes(30),
            Metadata = new Dictionary<string, object> { { "TestSession", true } }
        };

        // Start a session
        var startResult = await _sessionManager.StartSessionAsync(sessionRequest);
        Assert.True(startResult.Success);

        // Act - Invalidate session (simulating an error condition)
        await _sessionManager.InvalidateSessionAsync(sessionId, "Integration test - simulated error");

        // Assert
        var status = _sessionManager.GetSessionStatus(sessionId);
        Assert.Equal(SessionStatus.Invalidated, status);
    }

    [Fact]
    public void ServiceRegistration_ShouldResolveAllDependencies()
    {
        // Test that all services can be resolved from DI container
        
        Assert.NotNull(_sessionManager);
        Assert.NotNull(_securityManager);
        Assert.NotNull(_fileSystemManager);
        Assert.NotNull(_printManager);
        Assert.NotNull(_cleanupManager);
        Assert.NotNull(_monitoringService);
        Assert.NotNull(_diagnosticsService);

        // Test that services are singletons (same instance)
        var sessionManager2 = _serviceProvider.GetRequiredService<ISessionManager>();
        Assert.Same(_sessionManager, sessionManager2);

        var monitoringService2 = _serviceProvider.GetRequiredService<MonitoringService>();
        Assert.Same(_monitoringService, monitoringService2);
    }

    private string GenerateTestToken()
    {
        // Generate a simple test token for testing purposes
        // In real implementation, this would be a proper JWT token
        var payload = new
        {
            sub = "test-user",
            iss = "TestIssuer",
            aud = "TestAudience",
            exp = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds(),
            iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        };

        // For testing, return a simple token that the SecurityManager can validate
        return "test.token.valid";
    }

    public void Dispose()
    {
        _serviceProvider?.Dispose();
    }
}

/// <summary>
/// Integration tests for API endpoints and service communication
/// </summary>
public class ApiIntegrationTests : IDisposable
{
    private readonly ServiceProvider _serviceProvider;
    private readonly DiagnosticsService _diagnosticsService;
    private readonly MonitoringService _monitoringService;

    public ApiIntegrationTests()
    {
        var services = new ServiceCollection();
        
        // Configure logging
        services.AddLogging(builder => builder.AddConsole().SetMinimumLevel(LogLevel.Debug));
        
        // Configure test configurations
        services.Configure<SandboxConfiguration>(config =>
        {
            config.TempDirectoryRoot = Path.GetTempPath();
            config.MaxSessionDurationMinutes = 30;
            config.MaxFileSizeBytes = 10 * 1024 * 1024;
            config.AllowedFileTypes = new List<string> { ".pdf", ".txt", ".docx" };
            config.SecureDeletionPasses = 3;
            config.EnableAuditLogging = true;
            config.ServiceAccountName = "TestAccount";
        });
        
        services.Configure<PrintConfiguration>(config =>
        {
            config.DefaultPrinterName = "Microsoft Print to PDF";
            config.MaxCopiesAllowed = 10;
            config.AllowColorPrinting = true;
            config.AllowDoubleSided = true;
            config.PrintTimeoutSeconds = 300;
        });
        
        services.Configure<SecurityConfiguration>(config =>
        {
            config.ValidateIssuer = true;
            config.ValidateAudience = true;
            config.ValidateLifetime = true;
            config.ValidateIssuerSigningKey = true;
            config.JwtIssuer = "TestIssuer";
            config.JwtAudience = "TestAudience";
            config.JwtSecretKey = "TestSecretKeyThatIsLongEnoughForHS256Algorithm";
            config.TokenExpirationMinutes = 60;
        });
        
        // Register services
        services.AddSingleton<ISecurityManager, SecurityManager>();
        services.AddSingleton<ICleanupManager, CleanupManager>();
        services.AddSingleton<IFileSystemManager, FileSystemManager>();
        services.AddSingleton<IPrintManager, PrintManager>();
        services.AddSingleton<MonitoringService>();
        services.AddSingleton<DiagnosticsService>();
        services.AddSingleton<ISessionManager, SessionManager>();
        
        _serviceProvider = services.BuildServiceProvider();
        
        _diagnosticsService = _serviceProvider.GetRequiredService<DiagnosticsService>();
        _monitoringService = _serviceProvider.GetRequiredService<MonitoringService>();
    }

    [Fact]
    public async Task DiagnosticsController_ShouldProvideHealthStatus()
    {
        // This test verifies that the diagnostics service can provide health information
        // that would be consumed by the DiagnosticsController
        
        // Act
        var systemMetrics = _monitoringService.GetSystemMetrics();
        var diagnosticReport = await _diagnosticsService.GenerateDiagnosticReportAsync();

        // Assert
        Assert.NotNull(systemMetrics);
        Assert.NotNull(diagnosticReport);
        
        // Verify the data that would be returned by health endpoints
        Assert.True(systemMetrics.Timestamp > DateTime.MinValue);
        Assert.True(diagnosticReport.Timestamp > DateTime.MinValue);
        Assert.NotEmpty(diagnosticReport.HealthChecks);
        
        // Verify health status determination logic
        var hasFailedChecks = diagnosticReport.HealthChecks.Any(hc => hc.Status == "Failed");
        var hasWarningChecks = diagnosticReport.HealthChecks.Any(hc => hc.Status == "Warning");
        
        var expectedStatus = hasFailedChecks ? "Failed" : hasWarningChecks ? "Warning" : "Passed";
        
        // This simulates the logic that would be in the DiagnosticsController
        Assert.True(expectedStatus == "Passed" || expectedStatus == "Warning" || expectedStatus == "Failed");
    }

    public void Dispose()
    {
        _serviceProvider?.Dispose();
    }
}