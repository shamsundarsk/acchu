using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Net.Http;

namespace AcchuSandboxEngine.Services;

public class SecurityManager : ISecurityManager
{
    private readonly ILogger<SecurityManager> _logger;
    private readonly SecurityConfiguration _securityConfig;
    private readonly TokenValidationParameters _tokenValidationParameters;
    private readonly JwtSecurityTokenHandler _tokenHandler;

    public SecurityManager(
        ILogger<SecurityManager> logger,
        IOptions<SecurityConfiguration> securityConfig)
    {
        _logger = logger;
        _securityConfig = securityConfig.Value;
        _tokenHandler = new JwtSecurityTokenHandler();
        
        // Configure JWT validation parameters
        var jwtSecretKey = _securityConfig.JwtSecretKey;
        if (string.IsNullOrEmpty(jwtSecretKey))
        {
            _logger.LogWarning("JWT Secret Key is not configured. Using default key for demo purposes.");
            jwtSecretKey = "DefaultTestKey123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
        }
        
        var key = Encoding.UTF8.GetBytes(jwtSecretKey);
        _tokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = _securityConfig.ValidateIssuer,
            ValidateAudience = _securityConfig.ValidateAudience,
            ValidateLifetime = _securityConfig.ValidateLifetime,
            ValidateIssuerSigningKey = _securityConfig.ValidateIssuerSigningKey,
            ValidIssuer = _securityConfig.JwtIssuer,
            ValidAudience = _securityConfig.JwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ClockSkew = TimeSpan.FromMinutes(5) // Allow 5 minutes clock skew
        };
    }

    public async Task<ValidationResult> ValidateSessionTokenAsync(string sessionToken)
    {
        _logger.LogDebug("Validating session token");
        
        try
        {
            if (string.IsNullOrWhiteSpace(sessionToken))
            {
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Empty or null session token provided",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "TokenLength", 0 } }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Session token is required",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }

            // Validate JWT token with network communication error handling
            ClaimsPrincipal principal;
            SecurityToken validatedToken;
            
            try
            {
                principal = _tokenHandler.ValidateToken(sessionToken, _tokenValidationParameters, out validatedToken);
            }
            catch (SecurityTokenValidationException ex) when (ex.InnerException is HttpRequestException)
            {
                // Network communication error during token validation
                _logger.LogError(ex, "Network communication error during token validation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Network communication error during token validation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "Error", ex.Message },
                        { "NetworkError", true }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Network communication error during token validation",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            catch (SecurityTokenValidationException ex) when (ex.InnerException is TaskCanceledException)
            {
                // Timeout during token validation
                _logger.LogError(ex, "Timeout during token validation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Timeout during token validation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "Error", ex.Message },
                        { "TimeoutError", true }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Timeout during token validation",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            
            if (validatedToken is not JwtSecurityToken jwtToken)
            {
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Invalid JWT token format",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "TokenType", validatedToken?.GetType().Name ?? "null" } }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Invalid token format",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }

            // Extract claims
            var claims = new Dictionary<string, object>();
            foreach (var claim in principal.Claims)
            {
                claims[claim.Type] = claim.Value;
            }

            // Get session ID from claims
            var sessionId = principal.FindFirst("sessionId")?.Value ?? "unknown";
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SessionStarted,
                Description = "Session token validated successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "TokenExpiry", jwtToken.ValidTo },
                    { "Issuer", jwtToken.Issuer },
                    { "Audience", string.Join(",", jwtToken.Audiences) }
                }
            });

            return new ValidationResult
            {
                IsValid = true,
                ErrorMessage = string.Empty,
                ValidUntil = jwtToken.ValidTo,
                Claims = claims
            };
        }
        catch (SecurityTokenExpiredException ex)
        {
            _logger.LogWarning("Session token has expired: {Message}", ex.Message);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "Expired session token provided",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "ExpirationTime", ex.Expires } }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Session token has expired",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
        catch (SecurityTokenInvalidSignatureException ex)
        {
            _logger.LogError("Invalid token signature: {Message}", ex.Message);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "Invalid token signature detected",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Invalid token signature",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
        catch (HttpRequestException ex)
        {
            // Network communication error
            _logger.LogError(ex, "Network communication error during token validation");
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "Network communication error during token validation",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "Error", ex.Message },
                    { "NetworkError", true }
                }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Network communication error during token validation",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
        catch (TaskCanceledException ex)
        {
            // Timeout error
            _logger.LogError(ex, "Timeout during token validation");
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "Timeout during token validation",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "Error", ex.Message },
                    { "TimeoutError", true }
                }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Timeout during token validation",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating session token");
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "Token validation error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Token validation failed",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
    }

    public async Task<bool> ValidateSessionAsync(string sessionId)
    {
        _logger.LogDebug("Validating session {SessionId}", sessionId);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            _logger.LogWarning("Session validation failed: empty session ID");
            return false;
        }

        try
        {
            // For now, implement basic session validation
            // In a real implementation, this would check session state, expiration, etc.
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SessionValidated,
                Description = "Session validation requested",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "SessionId", sessionId },
                    { "ValidationResult", true }
                }
            });

            return true; // For demo purposes, always return true
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating session {SessionId}", sessionId);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = "Session validation error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "Error", ex.Message },
                    { "SessionId", sessionId }
                }
            });

            return false;
        }
    }

    public async Task<ValidationResult> ValidateFileSourceAsync(Stream fileStream, string expectedSource)
    {
        _logger.LogDebug("Validating file source against expected source {ExpectedSource}", expectedSource);
        
        try
        {
            if (fileStream == null || !fileStream.CanRead)
            {
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Invalid file stream provided for source validation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "StreamNull", fileStream == null },
                        { "CanRead", fileStream?.CanRead ?? false }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Invalid file stream",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }

            // Reset stream position for reading
            var originalPosition = fileStream.Position;
            fileStream.Position = 0;

            // Calculate file hash for integrity verification with error handling
            string fileHash;
            try
            {
                using var sha256 = SHA256.Create();
                var hashBytes = await sha256.ComputeHashAsync(fileStream);
                fileHash = Convert.ToBase64String(hashBytes);
            }
            catch (IOException ex)
            {
                _logger.LogError(ex, "I/O error during file hash calculation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "I/O error during file hash calculation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "Error", ex.Message } }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "File integrity check failed",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "Access denied during file hash calculation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Access denied during file hash calculation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "Error", ex.Message } }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "File access denied",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            finally
            {
                // Reset stream position
                try
                {
                    fileStream.Position = originalPosition;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to reset stream position");
                }
            }

            // Validate source with network communication error handling
            bool isValidSource;
            try
            {
                // For now, we validate that the expected source matches our configuration
                // In a real implementation, this would involve cryptographic signatures or other verification
                // that might require network communication with the ACCHU Backend
                isValidSource = await ValidateSourceWithBackendAsync(expectedSource, fileHash);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Network communication error during source validation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Network communication error during source validation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "Error", ex.Message },
                        { "NetworkError", true },
                        { "ExpectedSource", expectedSource }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Network communication error during source validation",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Timeout during source validation");
                
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "Timeout during source validation",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "Error", ex.Message },
                        { "TimeoutError", true },
                        { "ExpectedSource", expectedSource }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Timeout during source validation",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }
            
            if (!isValidSource)
            {
                await LogSecurityEventAsync(new SecurityEvent
                {
                    EventType = SecurityEventType.SecurityViolation,
                    Description = "File source validation failed - unauthorized source",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> 
                    { 
                        { "ExpectedSource", _securityConfig.ExpectedFileSource },
                        { "ProvidedSource", expectedSource },
                        { "FileHash", fileHash }
                    }
                });
                
                return new ValidationResult
                {
                    IsValid = false,
                    ErrorMessage = "Unauthorized file source",
                    ValidUntil = DateTime.MinValue,
                    Claims = new Dictionary<string, object>()
                };
            }

            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.FileReceived,
                Description = "File source validated successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "Source", expectedSource },
                    { "FileHash", fileHash },
                    { "FileSize", fileStream.Length }
                }
            });

            return new ValidationResult
            {
                IsValid = true,
                ErrorMessage = string.Empty,
                ValidUntil = DateTime.UtcNow.AddMinutes(_securityConfig.TokenExpirationMinutes),
                Claims = new Dictionary<string, object> 
                { 
                    { "source", expectedSource },
                    { "fileHash", fileHash },
                    { "validatedAt", DateTime.UtcNow }
                }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating file source");
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = "File source validation error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "File source validation failed",
                ValidUntil = DateTime.MinValue,
                Claims = new Dictionary<string, object>()
            };
        }
    }

    public async Task LogSecurityEventAsync(SecurityEvent securityEvent)
    {
        try
        {
            // Ensure timestamp is set
            if (securityEvent.Timestamp == default)
            {
                securityEvent.Timestamp = DateTime.UtcNow;
            }

            // Log to application logger with appropriate level
            var logLevel = securityEvent.EventType switch
            {
                SecurityEventType.SecurityViolation => LogLevel.Warning,
                SecurityEventType.SessionInvalidated => LogLevel.Warning,
                SecurityEventType.SessionStarted => LogLevel.Information,
                SecurityEventType.SessionEnded => LogLevel.Information,
                SecurityEventType.FileReceived => LogLevel.Information,
                SecurityEventType.PrintJobSubmitted => LogLevel.Information,
                SecurityEventType.CleanupCompleted => LogLevel.Information,
                _ => LogLevel.Information
            };

            _logger.Log(logLevel, "Security Event: {EventType} - {Description} for session {SessionId} at {Timestamp}", 
                securityEvent.EventType, securityEvent.Description, securityEvent.SessionId, securityEvent.Timestamp);

            // If security event logging is enabled, write to dedicated security log
            if (_securityConfig.EnableSecurityEventLogging)
            {
                await WriteSecurityLogAsync(securityEvent);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log security event");
            // Don't throw - logging failures shouldn't break the application
        }
    }

    public async Task<bool> EnforceFailClosedAsync(string sessionId, string failureReason)
    {
        _logger.LogError("Enforcing fail-closed for session {SessionId}: {Reason}", sessionId, failureReason);
        
        try
        {
            // Log the fail-closed enforcement
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SessionInvalidated,
                Description = $"Fail-closed enforcement triggered: {failureReason}",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "FailureReason", failureReason },
                    { "EnforcementTime", DateTime.UtcNow }
                }
            });

            // Trigger comprehensive cleanup
            _logger.LogCritical("Fail-closed enforcement triggered for session {SessionId}. Cleanup required.", sessionId);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = "Fail-closed enforcement triggered - cleanup required",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "FailureReason", failureReason },
                    { "EnforcementTime", DateTime.UtcNow },
                    { "CleanupRequired", true }
                }
            });
            
            return false; // Fail-closed enforcement always returns false
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during fail-closed enforcement for session {SessionId}", sessionId);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = "Fail-closed enforcement error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });
            
            return false;
        }
    }

    public async Task<ActionValidationResult> ValidateActionAsync(ActionRequest actionRequest)
    {
        _logger.LogDebug("Validating action {Action} for session {SessionId}", actionRequest.RequestedAction, actionRequest.SessionId);
        
        try
        {
            var result = new ActionValidationResult
            {
                AllowedAction = ActionType.Unknown,
                ValidatedParameters = new Dictionary<string, object>()
            };

            // Check if action restriction is enabled
            if (!_securityConfig.EnableActionRestriction)
            {
                result.IsAllowed = true;
                result.AllowedAction = actionRequest.RequestedAction;
                result.ValidatedParameters = actionRequest.Parameters;
                return result;
            }

            // Validate the requested action against allowed actions
            var actionName = actionRequest.RequestedAction.ToString();
            var isAllowed = _securityConfig.AllowedActions.Contains(actionName, StringComparer.OrdinalIgnoreCase);
            var isRestricted = _securityConfig.RestrictedActions.Contains(actionName, StringComparer.OrdinalIgnoreCase);

            if (!isAllowed || isRestricted)
            {
                result.IsAllowed = false;
                result.ErrorMessage = $"Action '{actionName}' is not allowed. Only print actions are permitted.";
                result.ViolationReasons.Add($"Attempted restricted action: {actionName}");
                result.ViolationReasons.Add($"Allowed actions: {string.Join(", ", _securityConfig.AllowedActions)}");

                // Log the action violation
                await LogActionViolationAsync(actionRequest.SessionId, actionRequest, result.ViolationReasons);

                // Enforce fail-closed if configured
                if (_securityConfig.FailClosedOnActionViolation)
                {
                    await EnforceFailClosedAsync(actionRequest.SessionId, $"Action restriction violation: {actionName}");
                }

                return result;
            }

            // Action is allowed
            result.IsAllowed = true;
            result.AllowedAction = actionRequest.RequestedAction;
            result.ValidatedParameters = actionRequest.Parameters;

            // Log successful action validation
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = actionRequest.SessionId,
                EventType = SecurityEventType.PrintJobSubmitted,
                Description = $"Action '{actionName}' validated successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "Action", actionName },
                    { "RequestSource", actionRequest.RequestSource },
                    { "ParameterCount", actionRequest.Parameters.Count }
                }
            });

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating action {Action} for session {SessionId}", actionRequest.RequestedAction, actionRequest.SessionId);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = actionRequest.SessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = "Action validation error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });

            // Fail closed on error
            return new ActionValidationResult
            {
                IsAllowed = false,
                ErrorMessage = "Action validation failed",
                ViolationReasons = new List<string> { "Internal validation error" }
            };
        }
    }

    public async Task<ActionValidationResult> ValidateParametersAsync(string sessionId, ActionType actionType, Dictionary<string, object> parameters, Dictionary<string, object> expectedParameters)
    {
        _logger.LogDebug("Validating parameters for action {Action} in session {SessionId}", actionType, sessionId);
        
        try
        {
            var result = new ActionValidationResult
            {
                IsAllowed = true,
                AllowedAction = actionType,
                ValidatedParameters = new Dictionary<string, object>()
            };

            var violations = new List<ParameterViolation>();

            // Validate each expected parameter
            foreach (var expectedParam in expectedParameters)
            {
                var paramName = expectedParam.Key;
                var expectedValue = expectedParam.Value;

                if (!parameters.TryGetValue(paramName, out var actualValue))
                {
                    violations.Add(new ParameterViolation
                    {
                        ParameterName = paramName,
                        ExpectedValue = expectedValue,
                        ActualValue = null,
                        ViolationType = "Missing",
                        Description = $"Required parameter '{paramName}' is missing"
                    });
                    continue;
                }

                // Validate parameter value based on type and constraints
                if (!ValidateParameterValue(paramName, expectedValue, actualValue, out var violation))
                {
                    violations.Add(violation);
                }
                else
                {
                    result.ValidatedParameters[paramName] = actualValue;
                }
            }

            // Check for unexpected parameters (potential tampering)
            foreach (var param in parameters)
            {
                if (!expectedParameters.ContainsKey(param.Key))
                {
                    violations.Add(new ParameterViolation
                    {
                        ParameterName = param.Key,
                        ExpectedValue = null,
                        ActualValue = param.Value,
                        ViolationType = "Unexpected",
                        Description = $"Unexpected parameter '{param.Key}' detected"
                    });
                }
            }

            if (violations.Count > 0)
            {
                result.IsAllowed = false;
                result.ErrorMessage = $"Parameter validation failed: {violations.Count} violation(s) detected";
                result.ViolationReasons = violations.Select(v => v.Description).ToList();

                // Log parameter violations
                await LogParameterViolationAsync(sessionId, violations);

                // Enforce fail-closed if configured
                if (_securityConfig.FailClosedOnParameterViolation)
                {
                    await EnforceFailClosedAsync(sessionId, $"Parameter violation detected: {string.Join(", ", result.ViolationReasons)}");
                }
            }
            else
            {
                // Log successful parameter validation
                await LogSecurityEventAsync(new SecurityEvent
                {
                    SessionId = sessionId,
                    EventType = SecurityEventType.PrintJobSubmitted,
                    Description = $"Parameters validated successfully for action '{actionType}'",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object>
                    {
                        { "Action", actionType.ToString() },
                        { "ValidatedParameterCount", result.ValidatedParameters.Count }
                    }
                });
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating parameters for action {Action} in session {SessionId}", actionType, sessionId);
            
            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = "Parameter validation error",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> { { "Error", ex.Message } }
            });

            // Fail closed on error
            return new ActionValidationResult
            {
                IsAllowed = false,
                ErrorMessage = "Parameter validation failed",
                ViolationReasons = new List<string> { "Internal validation error" }
            };
        }
    }

    public async Task LogActionViolationAsync(string sessionId, ActionRequest actionRequest, List<string> violationReasons)
    {
        try
        {
            if (!_securityConfig.LogActionViolations)
            {
                return;
            }

            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.ActionRestrictionViolation,
                Description = $"Action restriction violation: {actionRequest.RequestedAction}",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RequestedAction", actionRequest.RequestedAction.ToString() },
                    { "RequestSource", actionRequest.RequestSource },
                    { "RequestTime", actionRequest.RequestTime },
                    { "ViolationReasons", violationReasons },
                    { "AllowedActions", _securityConfig.AllowedActions },
                    { "RestrictedActions", _securityConfig.RestrictedActions }
                }
            });

            _logger.LogWarning("Action violation logged for session {SessionId}: {Action} from {Source}", 
                sessionId, actionRequest.RequestedAction, actionRequest.RequestSource);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log action violation for session {SessionId}", sessionId);
        }
    }

    public async Task LogParameterViolationAsync(string sessionId, List<ParameterViolation> violations)
    {
        try
        {
            if (!_securityConfig.LogActionViolations)
            {
                return;
            }

            await LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.ParameterViolation,
                Description = $"Parameter violation detected: {violations.Count} violation(s)",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "ViolationCount", violations.Count },
                    { "Violations", violations.Select(v => new
                        {
                            Parameter = v.ParameterName,
                            Type = v.ViolationType,
                            Description = v.Description,
                            Expected = SanitizeParameterValue(v.ExpectedValue),
                            Actual = SanitizeParameterValue(v.ActualValue)
                        }).ToList()
                    }
                }
            });

            _logger.LogWarning("Parameter violations logged for session {SessionId}: {Count} violation(s)", 
                sessionId, violations.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log parameter violations for session {SessionId}", sessionId);
        }
    }

    private static bool ValidateParameterValue(string paramName, object expectedValue, object actualValue, out ParameterViolation violation)
    {
        violation = new ParameterViolation
        {
            ParameterName = paramName,
            ExpectedValue = expectedValue,
            ActualValue = actualValue
        };

        try
        {
            // Handle different parameter validation scenarios
            switch (paramName.ToLowerInvariant())
            {
                case "copies":
                    if (expectedValue is int expectedCopies && actualValue is int actualCopies)
                    {
                        if (actualCopies != expectedCopies)
                        {
                            violation.ViolationType = "ValueMismatch";
                            violation.Description = $"Copy count mismatch: expected {expectedCopies}, got {actualCopies}";
                            return false;
                        }
                        if (actualCopies <= 0 || actualCopies > 100) // Reasonable bounds
                        {
                            violation.ViolationType = "OutOfRange";
                            violation.Description = $"Copy count out of range: {actualCopies} (must be 1-100)";
                            return false;
                        }
                    }
                    else
                    {
                        violation.ViolationType = "TypeMismatch";
                        violation.Description = $"Copy count type mismatch: expected int, got {actualValue?.GetType().Name ?? "null"}";
                        return false;
                    }
                    break;

                case "colorprinting":
                    if (expectedValue is bool expectedColor && actualValue is bool actualColor)
                    {
                        if (actualColor != expectedColor)
                        {
                            violation.ViolationType = "ValueMismatch";
                            violation.Description = $"Color printing mismatch: expected {expectedColor}, got {actualColor}";
                            return false;
                        }
                    }
                    else
                    {
                        violation.ViolationType = "TypeMismatch";
                        violation.Description = $"Color printing type mismatch: expected bool, got {actualValue?.GetType().Name ?? "null"}";
                        return false;
                    }
                    break;

                case "doublesided":
                    if (expectedValue is bool expectedDuplex && actualValue is bool actualDuplex)
                    {
                        if (actualDuplex != expectedDuplex)
                        {
                            violation.ViolationType = "ValueMismatch";
                            violation.Description = $"Double-sided printing mismatch: expected {expectedDuplex}, got {actualDuplex}";
                            return false;
                        }
                    }
                    else
                    {
                        violation.ViolationType = "TypeMismatch";
                        violation.Description = $"Double-sided printing type mismatch: expected bool, got {actualValue?.GetType().Name ?? "null"}";
                        return false;
                    }
                    break;

                case "printername":
                    if (expectedValue is string expectedPrinter && actualValue is string actualPrinter)
                    {
                        if (!string.Equals(actualPrinter, expectedPrinter, StringComparison.OrdinalIgnoreCase))
                        {
                            violation.ViolationType = "ValueMismatch";
                            violation.Description = $"Printer name mismatch: expected '{expectedPrinter}', got '{actualPrinter}'";
                            return false;
                        }
                    }
                    else
                    {
                        violation.ViolationType = "TypeMismatch";
                        violation.Description = $"Printer name type mismatch: expected string, got {actualValue?.GetType().Name ?? "null"}";
                        return false;
                    }
                    break;

                default:
                    // Generic validation for other parameters
                    if (!Equals(expectedValue, actualValue))
                    {
                        violation.ViolationType = "ValueMismatch";
                        violation.Description = $"Parameter '{paramName}' value mismatch: expected '{expectedValue}', got '{actualValue}'";
                        return false;
                    }
                    break;
            }

            return true;
        }
        catch (Exception ex)
        {
            violation.ViolationType = "ValidationError";
            violation.Description = $"Error validating parameter '{paramName}': {ex.Message}";
            return false;
        }
    }

    private static object SanitizeParameterValue(object value)
    {
        // Sanitize sensitive parameter values for logging
        if (value is string stringValue)
        {
            var lowerValue = stringValue.ToLowerInvariant();
            if (lowerValue.Contains("token") || lowerValue.Contains("password") || lowerValue.Contains("secret"))
            {
                return "[REDACTED]";
            }
        }
        
        return value;
    }

    private async Task WriteSecurityLogAsync(SecurityEvent securityEvent)
    {
        try
        {
            // Ensure security log directory exists
            var logPath = Environment.ExpandEnvironmentVariables(_securityConfig.SecurityLogPath);
            Directory.CreateDirectory(logPath);

            // Create log file name with date
            var logFileName = $"security-{DateTime.UtcNow:yyyy-MM-dd}.log";
            var logFilePath = Path.Combine(logPath, logFileName);

            // Create log entry (sanitized for privacy)
            var logEntry = new
            {
                Timestamp = securityEvent.Timestamp.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                EventType = securityEvent.EventType.ToString(),
                SessionId = string.IsNullOrEmpty(securityEvent.SessionId) ? "unknown" : 
                           securityEvent.SessionId.Length > 8 ? securityEvent.SessionId[..8] + "..." : securityEvent.SessionId,
                Description = securityEvent.Description,
                Details = SanitizeDetailsForLogging(securityEvent.Details)
            };

            var logLine = JsonSerializer.Serialize(logEntry) + Environment.NewLine;
            
            // Write to log file (append mode)
            await File.AppendAllTextAsync(logFilePath, logLine);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write security log entry");
            // Don't throw - logging failures shouldn't break the application
        }
    }

    private static Dictionary<string, object> SanitizeDetailsForLogging(Dictionary<string, object> details)
    {
        var sanitized = new Dictionary<string, object>();
        
        foreach (var kvp in details)
        {
            // Sanitize sensitive information
            var key = kvp.Key.ToLowerInvariant();
            if (key.Contains("token") || key.Contains("password") || key.Contains("secret") || key.Contains("key"))
            {
                sanitized[kvp.Key] = "[REDACTED]";
            }
            else if (key.Contains("hash") && kvp.Value is string hashValue && hashValue.Length > 16)
            {
                // Show only first 8 characters of hashes for identification
                sanitized[kvp.Key] = hashValue[..8] + "...";
            }
            else
            {
                sanitized[kvp.Key] = kvp.Value;
            }
        }
        
        return sanitized;
    }

    /// <summary>
    /// Validates file source with ACCHU Backend (with network error handling)
    /// </summary>
    private async Task<bool> ValidateSourceWithBackendAsync(string expectedSource, string fileHash)
    {
        try
        {
            // In a real implementation, this would make an HTTP request to the ACCHU Backend
            // to validate the file source and hash. For now, we simulate this with local validation.
            
            _logger.LogDebug("Validating source {ExpectedSource} with backend", expectedSource);
            
            // Simulate network delay
            await Task.Delay(100);
            
            // Validate that the expected source matches our configuration
            var isValidSource = string.Equals(expectedSource, _securityConfig.ExpectedFileSource, StringComparison.OrdinalIgnoreCase);
            
            if (isValidSource)
            {
                _logger.LogDebug("Source validation successful for {ExpectedSource}", expectedSource);
            }
            else
            {
                _logger.LogWarning("Source validation failed for {ExpectedSource}, expected {ConfiguredSource}", 
                    expectedSource, _securityConfig.ExpectedFileSource);
            }
            
            return isValidSource;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error during backend source validation");
            throw; // Re-throw to be handled by caller
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Timeout during backend source validation");
            throw; // Re-throw to be handled by caller
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during backend source validation");
            
            // For unexpected errors, fail closed
            return false;
        }
    }
}