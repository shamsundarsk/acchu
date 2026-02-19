using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace AcchuSandboxEngine.Tests.PropertyTests;

public class SessionPropertyTests : IDisposable
{
    private readonly Mock<ILogger<SessionManager>> _mockLogger;
    private readonly SandboxConfiguration _config;
    private readonly SessionManager _sessionManager;

    public SessionPropertyTests()
    {
        _mockLogger = new Mock<ILogger<SessionManager>>();
        
        _config = new SandboxConfiguration
        {
            MaxSessionDurationMinutes = 60,
            TempDirectoryRoot = Path.GetTempPath(),
            MaxFileSizeBytes = 100 * 1024 * 1024,
            AllowedFileTypes = new List<string> { ".pdf", ".doc", ".docx", ".txt" },
            SecureDeletionPasses = 3,
            EnableAuditLogging = true,
            ServiceAccountName = "NT AUTHORITY\\LOCAL SERVICE"
        };

        var mockOptions = new Mock<IOptions<SandboxConfiguration>>();
        mockOptions.Setup(x => x.Value).Returns(_config);

        _sessionManager = new SessionManager(_mockLogger.Object, mockOptions.Object);
    }
    [Property]
    public Property SessionRequest_WithValidData_HasConsistentProperties(
        NonEmptyString sessionId, 
        NonEmptyString sessionToken)
    {
        return Prop.ForAll<DateTime>(expirationTime =>
        {
            // Arrange
            var request = new SessionRequest
            {
                SessionId = sessionId.Get,
                SessionToken = sessionToken.Get,
                ExpirationTime = expirationTime
            };

            // Act & Assert
            return (request.SessionId == sessionId.Get)
                .And(request.SessionToken == sessionToken.Get)
                .And(request.ExpirationTime == expirationTime)
                .And(request.Metadata != null);
        });
    }

    [Property]
    public Property SessionResult_WithValidData_HasConsistentProperties(
        bool success,
        NonEmptyString sessionId,
        string errorMessage)
    {
        // Arrange
        var result = new SessionResult
        {
            Success = success,
            SessionId = sessionId.Get,
            ErrorMessage = errorMessage ?? string.Empty,
            Status = SessionStatus.Active
        };

        // Act & Assert
        return (result.Success == success)
            .And(result.SessionId == sessionId.Get)
            .And(result.ErrorMessage == (errorMessage ?? string.Empty))
            .And(result.Status == SessionStatus.Active);
    }

    [Property]
    public Property PrintJobDescriptor_WithValidData_HasConsistentProperties(
        NonEmptyString fileName,
        PositiveInt copies,
        bool colorPrinting,
        bool doubleSided)
    {
        // Arrange
        var descriptor = new PrintJobDescriptor
        {
            FileName = fileName.Get,
            Copies = copies.Get,
            ColorPrinting = colorPrinting,
            DoubleSided = doubleSided,
            PrinterName = "TestPrinter"
        };

        // Act & Assert
        return (descriptor.FileName == fileName.Get)
            .And(descriptor.Copies == copies.Get)
            .And(descriptor.ColorPrinting == colorPrinting)
            .And(descriptor.DoubleSided == doubleSided)
            .And(descriptor.PrintSettings != null);
    }

    /// <summary>
    /// Property 16: Session Exclusivity
    /// Validates: Requirements 8.1, 8.2
    /// </summary>
    [Property(MaxTest = 100)]
    public Property SessionExclusivity_ShouldMaintainOnlyOneActiveSession()
    {
        return Prop.ForAll(
            Gen.ListOf(Gen.Elements(Enumerable.Range(1, 20).Select(i => Guid.NewGuid().ToString("N")[..16]))),
            (sessionIds) =>
            {
                if (sessionIds.Count < 2) return true; // Need at least 2 sessions to test exclusivity
                
                return Prop.ForAllAsync(async () =>
                {
                    var activeSessionId = string.Empty;
                    var rejectedCount = 0;
                    
                    try
                    {
                        // Attempt to start multiple sessions
                        foreach (var sessionId in sessionIds.Take(5)) // Limit to 5 for performance
                        {
                            var request = new SessionRequest
                            {
                                SessionId = sessionId,
                                SessionToken = "test-token-" + sessionId,
                                ExpirationTime = DateTime.UtcNow.AddMinutes(30),
                                Metadata = new Dictionary<string, object> { { "Test", true } }
                            };
                            
                            var result = await _sessionManager.StartSessionAsync(request);
                            
                            if (result.Success)
                            {
                                if (string.IsNullOrEmpty(activeSessionId))
                                {
                                    activeSessionId = sessionId;
                                    // Verify session is active
                                    var status = _sessionManager.GetSessionStatus(sessionId);
                                    if (status != SessionStatus.Active)
                                        return false;
                                }
                                else
                                {
                                    // Should not have multiple active sessions
                                    return false;
                                }
                            }
                            else
                            {
                                rejectedCount++;
                                // Verify rejection reason mentions active session
                                if (!result.ErrorMessage.Contains("active session", StringComparison.OrdinalIgnoreCase))
                                    return false;
                            }
                        }
                        
                        // Should have exactly one active session and the rest rejected
                        var expectedRejections = Math.Max(0, sessionIds.Take(5).Count() - 1);
                        return !string.IsNullOrEmpty(activeSessionId) && rejectedCount == expectedRejections;
                    }
                    finally
                    {
                        // Cleanup active session
                        if (!string.IsNullOrEmpty(activeSessionId))
                        {
                            await _sessionManager.EndSessionAsync(activeSessionId);
                        }
                    }
                });
            });
    }

    public void Dispose()
    {
        _sessionManager?.Dispose();
    }
}