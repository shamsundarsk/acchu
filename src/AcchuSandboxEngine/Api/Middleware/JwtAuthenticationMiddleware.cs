using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Api.Middleware;

/// <summary>
/// JWT authentication middleware for API requests
/// Requirements: 2.1, 8.5
/// </summary>
public class JwtAuthenticationMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<JwtAuthenticationMiddleware> _logger;
    private readonly SecurityConfiguration _securityConfig;
    private readonly ISecurityManager _securityManager;

    public JwtAuthenticationMiddleware(
        RequestDelegate next,
        ILogger<JwtAuthenticationMiddleware> logger,
        IOptions<SecurityConfiguration> securityConfig,
        ISecurityManager securityManager)
    {
        _next = next;
        _logger = logger;
        _securityConfig = securityConfig.Value;
        _securityManager = securityManager;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        
        try
        {
            // Skip authentication for health check endpoints and integration endpoints (for testing)
            if (context.Request.Path.StartsWithSegments("/api/health") ||
                context.Request.Path.StartsWithSegments("/api/integration"))
            {
                await _next(context);
                return;
            }

            // Extract JWT token from Authorization header
            var authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            {
                _logger.LogWarning("Missing or invalid Authorization header (Request: {RequestId})", requestId);
                
                await LogSecurityViolationAsync("Missing or invalid Authorization header", requestId, context);
                await WriteUnauthorizedResponseAsync(context, "Missing or invalid Authorization header", requestId);
                return;
            }

            var token = authHeader["Bearer ".Length..].Trim();

            // Validate JWT token
            var validationResult = await ValidateJwtTokenAsync(token, requestId);
            if (!validationResult.IsValid)
            {
                _logger.LogWarning("JWT token validation failed (Request: {RequestId}): {Error}", 
                    requestId, validationResult.ErrorMessage);
                
                await LogSecurityViolationAsync($"JWT token validation failed: {validationResult.ErrorMessage}", 
                    requestId, context);
                await WriteUnauthorizedResponseAsync(context, "Invalid token", requestId);
                return;
            }

            // Add claims to context for use by controllers
            if (validationResult.Claims != null)
            {
                var claimsIdentity = new ClaimsIdentity(
                    validationResult.Claims.Select(kvp => new Claim(kvp.Key, kvp.Value?.ToString() ?? "")),
                    "jwt");
                context.User = new ClaimsPrincipal(claimsIdentity);
            }

            // Add request ID to context for logging
            context.Items["RequestId"] = requestId;

            _logger.LogDebug("JWT authentication successful (Request: {RequestId})", requestId);

            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in JWT authentication middleware (Request: {RequestId})", requestId);
            
            await LogSecurityViolationAsync($"Exception in JWT authentication: {ex.Message}", requestId, context);
            await WriteInternalErrorResponseAsync(context, requestId);
        }
    }

    /// <summary>
    /// Validates a JWT token using the security manager
    /// </summary>
    private async Task<ValidationResult> ValidateJwtTokenAsync(string token, string requestId)
    {
        try
        {
            // Use the security manager to validate the token
            var result = await _securityManager.ValidateSessionTokenAsync(token);
            
            if (result.IsValid)
            {
                _logger.LogDebug("JWT token validated successfully (Request: {RequestId})", requestId);
            }
            else
            {
                _logger.LogWarning("JWT token validation failed (Request: {RequestId}): {Error}", 
                    requestId, result.ErrorMessage);
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception during JWT token validation (Request: {RequestId})", requestId);
            
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = $"Token validation exception: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Logs a security violation event
    /// </summary>
    private async Task LogSecurityViolationAsync(string description, string requestId, HttpContext context)
    {
        try
        {
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                EventType = SecurityEventType.SecurityViolation,
                Description = description,
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RequestId", requestId },
                    { "RemoteIpAddress", context.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", context.Request.Headers["User-Agent"].ToString() },
                    { "RequestPath", context.Request.Path.ToString() },
                    { "RequestMethod", context.Request.Method }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log security violation (Request: {RequestId})", requestId);
        }
    }

    /// <summary>
    /// Writes an unauthorized response
    /// </summary>
    private static async Task WriteUnauthorizedResponseAsync(HttpContext context, string message, string requestId)
    {
        context.Response.StatusCode = 401;
        context.Response.ContentType = "application/json";

        var response = new
        {
            Error = "Unauthorized",
            Message = message,
            RequestId = requestId,
            Timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(response));
    }

    /// <summary>
    /// Writes an internal error response
    /// </summary>
    private static async Task WriteInternalErrorResponseAsync(HttpContext context, string requestId)
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";

        var response = new
        {
            Error = "InternalError",
            Message = "An error occurred during authentication",
            RequestId = requestId,
            Timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(response));
    }
}