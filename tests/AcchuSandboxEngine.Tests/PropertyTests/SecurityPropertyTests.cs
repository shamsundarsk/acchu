using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using System.Text;
using Xunit;

namespace AcchuSandboxEngine.Tests.PropertyTests;

/// <summary>
/// Property-based tests for security-related functionality
/// </summary>
public class SecurityPropertyTests : IDisposable
{
    private readonly Mock<ILogger<SecurityManager>> _mockLogger;
    private readonly Mock<ICleanupManager> _mockCleanupManager;
    private readonly SecurityConfiguration _config;
    private readonly SecurityManager _securityManager;

    public SecurityPropertyTests()
    {
        _mockLogger = new Mock<ILogger<SecurityManager>>();
        _mockCleanupManager = new Mock<ICleanupManager>();
        
        _config = new SecurityConfiguration
        {
            JwtSecretKey = "TestSecretKeyThatIsAtLeast256BitsLong12345678901234567890",
            JwtIssuer = "ACCHU-Backend",
            JwtAudience = "ACCHU-Sandbox-Engine",
            TokenExpirationMinutes = 60,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ExpectedFileSource = "ACCHU-Backend",
            EnableSecurityEventLogging = true,
            SecurityLogPath = Path.GetTempPath(),
            AllowedActions = new List<string> { "Print", "Preview" },
            RestrictedActions = new List<string> { "Save", "Copy", "Export" },
            EnableActionRestriction = true,
            LogActionViolations = true,
            FailClosedOnActionViolation = true,
            FailClosedOnParameterViolation = true
        };

        var mockOptions = new Mock<IOptions<SecurityConfiguration>>();
        mockOptions.Setup(x => x.Value).Returns(_config);

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        _securityManager = new SecurityManager(_mockLogger.Object, mockOptions.Object, _mockCleanupManager.Object);
    }

    /// <summary>
    /// Property 2: Authorized File Reception
    /// Validates: Requirements 2.1, 2.2, 2.3
    /// </summary>
    [Property(MaxTest = 100)]
    public Property AuthorizedFileReception_ShouldAcceptValidFiles()
    {
        return Prop.ForAll(
            Gen.Elements(GetValidFileSources()),
            Gen.Elements(GetValidFileContents()),
            (validSource, fileContent) =>
            {
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Arrange
                        var fileStream = new MemoryStream(fileContent);
                        
                        // Act
                        var result = await _securityManager.ValidateFileSourceAsync(fileStream, validSource);
                        
                        // Assert - valid files from authorized sources should be accepted
                        return result.IsValid && 
                               result.Claims.ContainsKey("source") && 
                               result.Claims["source"].ToString() == validSource &&
                               result.Claims.ContainsKey("fileHash") &&
                               result.ValidUntil > DateTime.UtcNow;
                    }
                    catch
                    {
                        // Unexpected exceptions should not occur for valid files
                        return false;
                    }
                });
            });
    }

    /// <summary>
    /// Property 11: Fail-Closed Session Invalidation
    /// Validates: Requirements 5.1, 5.2, 5.3, 5.4
    /// </summary>
    [Property(MaxTest = 100)]
    public Property FailClosedSessionInvalidation_ShouldInvalidateOnFailure()
    {
        return Prop.ForAll(
            Gen.Elements(GetFailureScenarios()),
            (failureScenario) =>
            {
                var sessionId = Guid.NewGuid().ToString("N")[..16];
                
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Act - Enforce fail-closed behavior
                        var result = await _securityManager.EnforceFailClosedAsync(sessionId, failureScenario.Reason);
                        
                        // Assert - fail-closed should always trigger cleanup
                        _mockCleanupManager.Verify(x => x.PerformFullCleanupAsync(sessionId), Times.Once);
                        
                        // Result should indicate whether cleanup succeeded
                        return result == true; // Cleanup mock always returns success
                    }
                    catch
                    {
                        // Fail-closed should handle exceptions gracefully
                        return false;
                    }
                });
            });
    }

    private static string[] GetValidFileSources()
    {
        return new[] { "ACCHU-Backend" };
    }

    private static byte[][] GetValidFileContents()
    {
        return new[]
        {
            Encoding.UTF8.GetBytes("Valid document content"),
            CreateValidPdfContent(),
            CreateValidTextContent(),
            Encoding.UTF8.GetBytes("Customer document for printing")
        };
    }

    private static byte[] CreateValidPdfContent()
    {
        var content = new List<byte>();
        content.AddRange(Encoding.ASCII.GetBytes("%PDF-1.4"));
        content.AddRange(Encoding.UTF8.GetBytes("\nValid PDF document content"));
        return content.ToArray();
    }

    private static byte[] CreateValidTextContent()
    {
        return Encoding.UTF8.GetBytes("This is a valid text document for printing.");
    }

    private static FailureScenario[] GetFailureScenarios()
    {
        return new[]
        {
            new FailureScenario { Reason = "Security validation failed", Type = "Security" },
            new FailureScenario { Reason = "File system error occurred", Type = "FileSystem" },
            new FailureScenario { Reason = "Print spooler error", Type = "PrintSpooler" },
            new FailureScenario { Reason = "Network communication failure", Type = "Network" },
            new FailureScenario { Reason = "Token validation failed", Type = "Authentication" },
            new FailureScenario { Reason = "Parameter violation detected", Type = "ParameterViolation" }
        };
    }

    private class FailureScenario
    {
        public string Reason { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
    }

    public void Dispose()
    {
        // No cleanup needed for this test class
    }
}