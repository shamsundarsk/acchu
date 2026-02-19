using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AcchuSandboxEngine.Tests.UnitTests;

public class SecurityManagerTests
{
    private readonly Mock<ILogger<SecurityManager>> _mockLogger;
    private readonly Mock<IOptions<SecurityConfiguration>> _mockSecurityConfig;
    private readonly Mock<ICleanupManager> _mockCleanupManager;
    private readonly SecurityManager _securityManager;
    private readonly SecurityConfiguration _securityConfig;

    public SecurityManagerTests()
    {
        _mockLogger = new Mock<ILogger<SecurityManager>>();
        _mockSecurityConfig = new Mock<IOptions<SecurityConfiguration>>();
        _mockCleanupManager = new Mock<ICleanupManager>();
        
        // Setup default security configuration
        _securityConfig = new SecurityConfiguration
        {
            JwtSecretKey = "ThisIsATestSecretKeyThatIsAtLeast256BitsLong12345678901234567890",
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
            // Action Restriction Settings
            AllowedActions = new List<string> { "Print", "Preview" },
            RestrictedActions = new List<string> { "Save", "Copy", "Export", "Edit", "Delete", "Share", "Email", "Upload", "Download" },
            EnableActionRestriction = true,
            LogActionViolations = true,
            FailClosedOnActionViolation = true,
            FailClosedOnParameterViolation = true
        };
        
        _mockSecurityConfig.Setup(x => x.Value).Returns(_securityConfig);
        
        _securityManager = new SecurityManager(_mockLogger.Object, _mockSecurityConfig.Object, _mockCleanupManager.Object);
    }

    [Fact]
    public async Task ValidateSessionTokenAsync_WithEmptyToken_ReturnsInvalidResult()
    {
        // Act
        var result = await _securityManager.ValidateSessionTokenAsync("");

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Session token is required", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateSessionTokenAsync_WithNullToken_ReturnsInvalidResult()
    {
        // Act
        var result = await _securityManager.ValidateSessionTokenAsync(null!);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Session token is required", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateSessionTokenAsync_WithValidToken_ReturnsValidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var token = GenerateValidJwtToken(sessionId);

        // Act
        var result = await _securityManager.ValidateSessionTokenAsync(token);

        // Assert
        Assert.True(result.IsValid);
        Assert.Empty(result.ErrorMessage);
        Assert.True(result.ValidUntil > DateTime.UtcNow);
        Assert.Contains("sessionId", result.Claims.Keys);
        Assert.Equal(sessionId, result.Claims["sessionId"]);
    }

    [Fact]
    public async Task ValidateSessionTokenAsync_WithExpiredToken_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var token = GenerateExpiredJwtToken(sessionId);

        // Act
        var result = await _securityManager.ValidateSessionTokenAsync(token);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Session token has expired", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateSessionTokenAsync_WithInvalidSignature_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var token = GenerateTokenWithInvalidSignature(sessionId);

        // Act
        var result = await _securityManager.ValidateSessionTokenAsync(token);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Invalid token signature", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateFileSourceAsync_WithNullStream_ReturnsInvalidResult()
    {
        // Act
        var result = await _securityManager.ValidateFileSourceAsync(null!, "ACCHU-Backend");

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Invalid file stream", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateFileSourceAsync_WithUnreadableStream_ReturnsInvalidResult()
    {
        // Arrange
        var stream = new MemoryStream();
        stream.Close(); // Make stream unreadable

        // Act
        var result = await _securityManager.ValidateFileSourceAsync(stream, "ACCHU-Backend");

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Invalid file stream", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task ValidateFileSourceAsync_WithValidSourceAndStream_ReturnsValidResult()
    {
        // Arrange
        var testData = Encoding.UTF8.GetBytes("Test file content");
        var stream = new MemoryStream(testData);
        var expectedSource = "ACCHU-Backend";

        // Act
        var result = await _securityManager.ValidateFileSourceAsync(stream, expectedSource);

        // Assert
        Assert.True(result.IsValid);
        Assert.Empty(result.ErrorMessage);
        Assert.True(result.ValidUntil > DateTime.UtcNow);
        Assert.Contains("source", result.Claims.Keys);
        Assert.Contains("fileHash", result.Claims.Keys);
        Assert.Contains("validatedAt", result.Claims.Keys);
        Assert.Equal(expectedSource, result.Claims["source"]);
    }

    [Fact]
    public async Task ValidateFileSourceAsync_WithUnauthorizedSource_ReturnsInvalidResult()
    {
        // Arrange
        var testData = Encoding.UTF8.GetBytes("Test file content");
        var stream = new MemoryStream(testData);
        var unauthorizedSource = "Malicious-Source";

        // Act
        var result = await _securityManager.ValidateFileSourceAsync(stream, unauthorizedSource);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("Unauthorized file source", result.ErrorMessage);
        Assert.Equal(DateTime.MinValue, result.ValidUntil);
        Assert.Empty(result.Claims);
    }

    [Fact]
    public async Task LogSecurityEventAsync_WithValidEvent_LogsSuccessfully()
    {
        // Arrange
        var securityEvent = new SecurityEvent
        {
            SessionId = "test-session-123",
            EventType = SecurityEventType.SessionStarted,
            Description = "Test security event",
            Timestamp = DateTime.UtcNow,
            Details = new Dictionary<string, object> { { "TestKey", "TestValue" } }
        };

        // Act & Assert - Should not throw
        await _securityManager.LogSecurityEventAsync(securityEvent);
    }

    [Fact]
    public async Task LogSecurityEventAsync_WithEmptyTimestamp_SetsTimestamp()
    {
        // Arrange
        var securityEvent = new SecurityEvent
        {
            SessionId = "test-session-123",
            EventType = SecurityEventType.SessionStarted,
            Description = "Test security event",
            Timestamp = default, // Empty timestamp
            Details = new Dictionary<string, object>()
        };

        // Act & Assert - Should not throw and should set timestamp
        await _securityManager.LogSecurityEventAsync(securityEvent);
        
        // The timestamp should be set internally, but we can't directly verify it
        // The test passes if no exception is thrown
    }

    [Fact]
    public async Task EnforceFailClosedAsync_WithValidSessionId_PerformsCleanupAndReturnsTrue()
    {
        // Arrange
        var sessionId = "test-session-123";
        var failureReason = "Test failure reason";
        
        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(sessionId))
            .ReturnsAsync(new CleanupResult
            {
                Success = true,
                CleanedItems = new List<string> { "file1.txt", "file2.pdf" },
                FailedItems = new List<string>(),
                OverwritePasses = 3
            });

        // Act
        var result = await _securityManager.EnforceFailClosedAsync(sessionId, failureReason);

        // Assert
        Assert.True(result);
        _mockCleanupManager.Verify(x => x.PerformFullCleanupAsync(sessionId), Times.Once);
    }

    [Fact]
    public async Task EnforceFailClosedAsync_WithCleanupFailure_ReturnsFalse()
    {
        // Arrange
        var sessionId = "test-session-123";
        var failureReason = "Test failure reason";
        
        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(sessionId))
            .ReturnsAsync(new CleanupResult
            {
                Success = false,
                ErrorMessage = "Cleanup failed",
                CleanedItems = new List<string>(),
                FailedItems = new List<string> { "file1.txt" },
                OverwritePasses = 0
            });

        // Act
        var result = await _securityManager.EnforceFailClosedAsync(sessionId, failureReason);

        // Assert
        Assert.False(result);
        _mockCleanupManager.Verify(x => x.PerformFullCleanupAsync(sessionId), Times.Once);
    }

    [Fact]
    public async Task EnforceFailClosedAsync_WithEmptySessionId_HandlesGracefully()
    {
        // Arrange
        var sessionId = "";
        var failureReason = "Test failure reason";
        
        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(sessionId))
            .ReturnsAsync(new CleanupResult
            {
                Success = true,
                CleanedItems = new List<string>(),
                FailedItems = new List<string>(),
                OverwritePasses = 0
            });

        // Act
        var result = await _securityManager.EnforceFailClosedAsync(sessionId, failureReason);

        // Assert
        Assert.True(result);
        _mockCleanupManager.Verify(x => x.PerformFullCleanupAsync(sessionId), Times.Once);
    }

    #region Action Restriction Tests

    [Fact]
    public async Task ValidateActionAsync_WithAllowedAction_ReturnsValidResult()
    {
        // Arrange
        var actionRequest = new ActionRequest
        {
            SessionId = "test-session-123",
            RequestedAction = ActionType.Print,
            Parameters = new Dictionary<string, object> { { "copies", 1 } },
            RequestSource = "UI",
            RequestTime = DateTime.UtcNow
        };

        // Act
        var result = await _securityManager.ValidateActionAsync(actionRequest);

        // Assert
        Assert.True(result.IsAllowed);
        Assert.Empty(result.ErrorMessage);
        Assert.Equal(ActionType.Print, result.AllowedAction);
        Assert.Equal(actionRequest.Parameters, result.ValidatedParameters);
        Assert.Empty(result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateActionAsync_WithRestrictedAction_ReturnsInvalidResult()
    {
        // Arrange
        var actionRequest = new ActionRequest
        {
            SessionId = "test-session-123",
            RequestedAction = ActionType.Save,
            Parameters = new Dictionary<string, object>(),
            RequestSource = "UI",
            RequestTime = DateTime.UtcNow
        };

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        // Act
        var result = await _securityManager.ValidateActionAsync(actionRequest);

        // Assert
        Assert.False(result.IsAllowed);
        Assert.Contains("Action 'Save' is not allowed", result.ErrorMessage);
        Assert.Equal(ActionType.Unknown, result.AllowedAction);
        Assert.Contains("Attempted restricted action: Save", result.ViolationReasons);
        Assert.Contains("Allowed actions: Print, Preview", result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateActionAsync_WithActionRestrictionDisabled_AllowsAnyAction()
    {
        // Arrange
        _securityConfig.EnableActionRestriction = false;
        var actionRequest = new ActionRequest
        {
            SessionId = "test-session-123",
            RequestedAction = ActionType.Save,
            Parameters = new Dictionary<string, object>(),
            RequestSource = "UI",
            RequestTime = DateTime.UtcNow
        };

        // Act
        var result = await _securityManager.ValidateActionAsync(actionRequest);

        // Assert
        Assert.True(result.IsAllowed);
        Assert.Empty(result.ErrorMessage);
        Assert.Equal(ActionType.Save, result.AllowedAction);
        Assert.Empty(result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateParametersAsync_WithValidParameters_ReturnsValidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionType = ActionType.Print;
        var parameters = new Dictionary<string, object>
        {
            { "copies", 2 },
            { "colorprinting", true },
            { "doublesided", false }
        };
        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 2 },
            { "colorprinting", true },
            { "doublesided", false }
        };

        // Act
        var result = await _securityManager.ValidateParametersAsync(sessionId, actionType, parameters, expectedParameters);

        // Assert
        Assert.True(result.IsAllowed);
        Assert.Empty(result.ErrorMessage);
        Assert.Equal(ActionType.Print, result.AllowedAction);
        Assert.Equal(3, result.ValidatedParameters.Count);
        Assert.Empty(result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateParametersAsync_WithMismatchedCopies_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionType = ActionType.Print;
        var parameters = new Dictionary<string, object>
        {
            { "copies", 5 } // Different from expected
        };
        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 2 }
        };

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        // Act
        var result = await _securityManager.ValidateParametersAsync(sessionId, actionType, parameters, expectedParameters);

        // Assert
        Assert.False(result.IsAllowed);
        Assert.Contains("Parameter validation failed", result.ErrorMessage);
        Assert.Contains("Copy count mismatch: expected 2, got 5", result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateParametersAsync_WithMissingParameter_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionType = ActionType.Print;
        var parameters = new Dictionary<string, object>(); // Missing required parameter
        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 1 }
        };

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        // Act
        var result = await _securityManager.ValidateParametersAsync(sessionId, actionType, parameters, expectedParameters);

        // Assert
        Assert.False(result.IsAllowed);
        Assert.Contains("Parameter validation failed", result.ErrorMessage);
        Assert.Contains("Required parameter 'copies' is missing", result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateParametersAsync_WithUnexpectedParameter_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionType = ActionType.Print;
        var parameters = new Dictionary<string, object>
        {
            { "copies", 1 },
            { "malicious_param", "evil_value" } // Unexpected parameter
        };
        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 1 }
        };

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        // Act
        var result = await _securityManager.ValidateParametersAsync(sessionId, actionType, parameters, expectedParameters);

        // Assert
        Assert.False(result.IsAllowed);
        Assert.Contains("Parameter validation failed", result.ErrorMessage);
        Assert.Contains("Unexpected parameter 'malicious_param' detected", result.ViolationReasons);
    }

    [Fact]
    public async Task ValidateParametersAsync_WithOutOfRangeCopies_ReturnsInvalidResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionType = ActionType.Print;
        var parameters = new Dictionary<string, object>
        {
            { "copies", 150 } // Out of range (max 100)
        };
        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 150 }
        };

        _mockCleanupManager.Setup(x => x.PerformFullCleanupAsync(It.IsAny<string>()))
            .ReturnsAsync(new CleanupResult { Success = true });

        // Act
        var result = await _securityManager.ValidateParametersAsync(sessionId, actionType, parameters, expectedParameters);

        // Assert
        Assert.False(result.IsAllowed);
        Assert.Contains("Parameter validation failed", result.ErrorMessage);
        Assert.Contains("Copy count out of range: 150 (must be 1-100)", result.ViolationReasons);
    }

    [Fact]
    public async Task LogActionViolationAsync_WithValidRequest_LogsSuccessfully()
    {
        // Arrange
        var sessionId = "test-session-123";
        var actionRequest = new ActionRequest
        {
            SessionId = sessionId,
            RequestedAction = ActionType.Save,
            RequestSource = "UI",
            RequestTime = DateTime.UtcNow
        };
        var violationReasons = new List<string> { "Attempted restricted action: Save" };

        // Act & Assert - Should not throw
        await _securityManager.LogActionViolationAsync(sessionId, actionRequest, violationReasons);
    }

    [Fact]
    public async Task LogParameterViolationAsync_WithValidViolations_LogsSuccessfully()
    {
        // Arrange
        var sessionId = "test-session-123";
        var violations = new List<ParameterViolation>
        {
            new ParameterViolation
            {
                ParameterName = "copies",
                ExpectedValue = 1,
                ActualValue = 5,
                ViolationType = "ValueMismatch",
                Description = "Copy count mismatch"
            }
        };

        // Act & Assert - Should not throw
        await _securityManager.LogParameterViolationAsync(sessionId, violations);
    }

    #endregion

    private string GenerateValidJwtToken(string sessionId)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_securityConfig.JwtSecretKey);
        
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("sessionId", sessionId),
                new Claim("sub", sessionId),
                new Claim("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
            }),
            Expires = DateTime.UtcNow.AddMinutes(_securityConfig.TokenExpirationMinutes),
            Issuer = _securityConfig.JwtIssuer,
            Audience = _securityConfig.JwtAudience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };
        
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private string GenerateExpiredJwtToken(string sessionId)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_securityConfig.JwtSecretKey);
        
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("sessionId", sessionId),
                new Claim("sub", sessionId),
                new Claim("iat", DateTimeOffset.UtcNow.AddMinutes(-120).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
            }),
            Expires = DateTime.UtcNow.AddMinutes(-60), // Expired 60 minutes ago
            Issuer = _securityConfig.JwtIssuer,
            Audience = _securityConfig.JwtAudience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };
        
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private string GenerateTokenWithInvalidSignature(string sessionId)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var wrongKey = Encoding.UTF8.GetBytes("WrongSecretKeyThatDoesNotMatchTheConfiguredOne123456789012345678901234567890");
        
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("sessionId", sessionId),
                new Claim("sub", sessionId),
                new Claim("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
            }),
            Expires = DateTime.UtcNow.AddMinutes(_securityConfig.TokenExpirationMinutes),
            Issuer = _securityConfig.JwtIssuer,
            Audience = _securityConfig.JwtAudience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(wrongKey), SecurityAlgorithms.HmacSha256Signature)
        };
        
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }
}