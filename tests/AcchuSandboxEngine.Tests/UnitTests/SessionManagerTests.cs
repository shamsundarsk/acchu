using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace AcchuSandboxEngine.Tests.UnitTests;

public class SessionManagerTests : IDisposable
{
    private readonly Mock<ILogger<SessionManager>> _mockLogger;
    private readonly Mock<IOptions<SandboxConfiguration>> _mockConfig;
    private readonly ISessionManager _sessionManager;

    public SessionManagerTests()
    {
        _mockLogger = new Mock<ILogger<SessionManager>>();
        _mockConfig = new Mock<IOptions<SandboxConfiguration>>();
        
        // Setup default configuration
        _mockConfig.Setup(x => x.Value).Returns(new SandboxConfiguration
        {
            MaxSessionDurationMinutes = 60,
            TempDirectoryRoot = Path.GetTempPath(),
            MaxFileSizeBytes = 100 * 1024 * 1024,
            AllowedFileTypes = new List<string> { ".pdf", ".doc", ".docx", ".txt", ".jpg", ".png" },
            SecureDeletionPasses = 3,
            EnableAuditLogging = true,
            ServiceAccountName = "NT AUTHORITY\\LOCAL SERVICE"
        });
        
        _sessionManager = new SessionManager(_mockLogger.Object, _mockConfig.Object);
    }

    [Fact]
    public async Task StartSessionAsync_WithValidRequest_ReturnsSuccessResult()
    {
        // Arrange
        var request = new SessionRequest
        {
            SessionId = "test-session-123",
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        // Act
        var result = await _sessionManager.StartSessionAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(request.SessionId, result.SessionId);
        Assert.True(result.Success);
        Assert.Equal(SessionStatus.Active, result.Status);
        Assert.Empty(result.ErrorMessage);
    }

    [Fact]
    public async Task StartSessionAsync_WithEmptySessionId_ReturnsFailureResult()
    {
        // Arrange
        var request = new SessionRequest
        {
            SessionId = "",
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        // Act
        var result = await _sessionManager.StartSessionAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.Failed, result.Status);
        Assert.Equal("Session ID cannot be empty", result.ErrorMessage);
    }

    [Fact]
    public async Task StartSessionAsync_WithEmptySessionToken_ReturnsFailureResult()
    {
        // Arrange
        var request = new SessionRequest
        {
            SessionId = "test-session-123",
            SessionToken = "",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        // Act
        var result = await _sessionManager.StartSessionAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.Failed, result.Status);
        Assert.Equal("Session token cannot be empty", result.ErrorMessage);
    }

    [Fact]
    public async Task StartSessionAsync_WithActiveSessionExists_RejectsNewSession()
    {
        // Arrange
        var firstRequest = new SessionRequest
        {
            SessionId = "first-session",
            SessionToken = "first-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        var secondRequest = new SessionRequest
        {
            SessionId = "second-session",
            SessionToken = "second-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        // Act
        var firstResult = await _sessionManager.StartSessionAsync(firstRequest);
        var secondResult = await _sessionManager.StartSessionAsync(secondRequest);

        // Assert
        Assert.True(firstResult.Success);
        Assert.Equal(SessionStatus.Active, firstResult.Status);

        Assert.False(secondResult.Success);
        Assert.Equal(SessionStatus.Failed, secondResult.Status);
        Assert.Contains("active session first-session exists", secondResult.ErrorMessage);
    }

    [Fact]
    public async Task EndSessionAsync_WithValidSessionId_ReturnsSuccessResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var request = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        await _sessionManager.StartSessionAsync(request);

        // Act
        var result = await _sessionManager.EndSessionAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(sessionId, result.SessionId);
        Assert.True(result.Success);
        Assert.Equal(SessionStatus.Completed, result.Status);
    }

    [Fact]
    public async Task EndSessionAsync_WithNonExistentSession_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "non-existent-session";

        // Act
        var result = await _sessionManager.EndSessionAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(sessionId, result.SessionId);
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.None, result.Status);
        Assert.Equal("Session not found", result.ErrorMessage);
    }

    [Fact]
    public async Task EndSessionAsync_WithEmptySessionId_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "";

        // Act
        var result = await _sessionManager.EndSessionAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.Failed, result.Status);
        Assert.Equal("Session ID cannot be empty", result.ErrorMessage);
    }

    [Fact]
    public void GetSessionStatus_WithValidActiveSession_ReturnsActiveStatus()
    {
        // Arrange
        var sessionId = "test-session-123";
        var request = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        _sessionManager.StartSessionAsync(request).Wait();

        // Act
        var status = _sessionManager.GetSessionStatus(sessionId);

        // Assert
        Assert.Equal(SessionStatus.Active, status);
    }

    [Fact]
    public void GetSessionStatus_WithNonExistentSession_ReturnsNoneStatus()
    {
        // Arrange
        var sessionId = "non-existent-session";

        // Act
        var status = _sessionManager.GetSessionStatus(sessionId);

        // Assert
        Assert.Equal(SessionStatus.None, status);
    }

    [Fact]
    public void GetSessionStatus_WithEmptySessionId_ReturnsNoneStatus()
    {
        // Arrange
        var sessionId = "";

        // Act
        var status = _sessionManager.GetSessionStatus(sessionId);

        // Assert
        Assert.Equal(SessionStatus.None, status);
    }

    [Fact]
    public void GetSessionStatus_WithExpiredSession_ReturnsFailedStatus()
    {
        // Arrange
        var sessionId = "expired-session";
        var request = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddSeconds(-1) // Already expired
        };

        _sessionManager.StartSessionAsync(request).Wait();

        // Act
        var status = _sessionManager.GetSessionStatus(sessionId);

        // Assert
        Assert.Equal(SessionStatus.Failed, status);
    }

    [Fact]
    public async Task InvalidateSessionAsync_WithValidSession_InvalidatesSession()
    {
        // Arrange
        var sessionId = "test-session-123";
        var request = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        await _sessionManager.StartSessionAsync(request);

        // Act
        await _sessionManager.InvalidateSessionAsync(sessionId, "Test invalidation");

        // Assert
        var status = _sessionManager.GetSessionStatus(sessionId);
        Assert.Equal(SessionStatus.Invalidated, status);
    }

    [Fact]
    public async Task InvalidateSessionAsync_WithNonExistentSession_CompletesWithoutError()
    {
        // Arrange
        var sessionId = "non-existent-session";

        // Act & Assert - Should not throw
        await _sessionManager.InvalidateSessionAsync(sessionId, "Test invalidation");
    }

    [Fact]
    public async Task ProcessFileAsync_WithNonExistentSession_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "non-existent-session";
        var fileRequest = new FileRequest
        {
            FileName = "test.pdf",
            FileStream = new MemoryStream(),
            ExpectedSource = "ACCHU_Backend"
        };

        // Act
        var result = await _sessionManager.ProcessFileAsync(sessionId, fileRequest);

        // Assert
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.None, result.Status);
        Assert.Equal("Session not found", result.ErrorMessage);
    }

    [Fact]
    public async Task ProcessFileAsync_WithInactiveSession_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var request = new SessionRequest
        {
            SessionId = sessionId,
            SessionToken = "test-token",
            ExpirationTime = DateTime.UtcNow.AddHours(1)
        };

        await _sessionManager.StartSessionAsync(request);
        await _sessionManager.EndSessionAsync(sessionId); // End the session

        var fileRequest = new FileRequest
        {
            FileName = "test.pdf",
            FileStream = new MemoryStream(),
            ExpectedSource = "ACCHU_Backend"
        };

        // Act
        var result = await _sessionManager.ProcessFileAsync(sessionId, fileRequest);

        // Assert
        Assert.False(result.Success);
        Assert.Equal(SessionStatus.Completed, result.Status);
        Assert.Contains("Session is not active", result.ErrorMessage);
    }

    [Fact]
    public async Task ExecutePrintJobAsync_WithNonExistentSession_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "non-existent-session";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 1,
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "Default Printer"
        };

        // Act
        var result = await _sessionManager.ExecutePrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.False(result.Success);
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Equal("Session not found", result.ErrorMessage);
    }

    public void Dispose()
    {
        _sessionManager?.Dispose();
    }
}