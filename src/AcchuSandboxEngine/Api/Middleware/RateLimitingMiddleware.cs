using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Api.Middleware;

/// <summary>
/// Rate limiting middleware to prevent API abuse
/// Requirements: API rate limiting and request validation
/// </summary>
public class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitingMiddleware> _logger;
    private readonly ISecurityManager _securityManager;

    // Rate limiting configuration
    private readonly int _maxRequestsPerMinute = 60;
    private readonly int _maxRequestsPerHour = 1000;
    private readonly int _maxFilesPerSession = 10;

    // In-memory rate limiting storage (in production, use Redis or similar)
    private readonly ConcurrentDictionary<string, ClientRateLimit> _clientLimits = new();
    private readonly ConcurrentDictionary<string, SessionRateLimit> _sessionLimits = new();

    public RateLimitingMiddleware(
        RequestDelegate next,
        ILogger<RateLimitingMiddleware> logger,
        ISecurityManager securityManager)
    {
        _next = next;
        _logger = logger;
        _securityManager = securityManager;

        // Start cleanup task for expired entries
        _ = Task.Run(CleanupExpiredEntriesAsync);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = context.Items["RequestId"]?.ToString() ?? Guid.NewGuid().ToString("N")[..8];
        
        try
        {
            // Skip rate limiting for health check endpoints
            if (context.Request.Path.StartsWithSegments("/api/health"))
            {
                await _next(context);
                return;
            }

            var clientId = GetClientIdentifier(context);
            var sessionId = ExtractSessionId(context);

            // Check client-based rate limits
            if (!await CheckClientRateLimitAsync(clientId, requestId, context))
            {
                return; // Rate limit exceeded, response already written
            }

            // Check session-based rate limits for file uploads
            if (IsFileUploadRequest(context) && !string.IsNullOrEmpty(sessionId))
            {
                if (!await CheckSessionRateLimitAsync(sessionId, requestId, context))
                {
                    return; // Rate limit exceeded, response already written
                }
            }

            _logger.LogDebug("Rate limiting check passed for client {ClientId} (Request: {RequestId})", 
                clientId, requestId);

            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in rate limiting middleware (Request: {RequestId})", requestId);
            await WriteInternalErrorResponseAsync(context, requestId);
        }
    }

    /// <summary>
    /// Gets a unique identifier for the client
    /// </summary>
    private static string GetClientIdentifier(HttpContext context)
    {
        // Use IP address as primary identifier
        var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        
        // Add user agent hash for additional uniqueness
        var userAgent = context.Request.Headers["User-Agent"].ToString();
        var userAgentHash = string.IsNullOrEmpty(userAgent) ? "none" : 
            Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(userAgent)))[..8];

        return $"{ipAddress}:{userAgentHash}";
    }

    /// <summary>
    /// Extracts session ID from the request
    /// </summary>
    private static string? ExtractSessionId(HttpContext context)
    {
        // Try to get session ID from URL path
        var pathSegments = context.Request.Path.Value?.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (pathSegments?.Length >= 3 && pathSegments[0] == "api" && pathSegments[1] == "session")
        {
            return pathSegments[2];
        }

        return null;
    }

    /// <summary>
    /// Checks if the request is a file upload
    /// </summary>
    private static bool IsFileUploadRequest(HttpContext context)
    {
        return context.Request.Method == "POST" && 
               context.Request.Path.Value?.Contains("/files") == true;
    }

    /// <summary>
    /// Checks client-based rate limits
    /// </summary>
    private async Task<bool> CheckClientRateLimitAsync(string clientId, string requestId, HttpContext context)
    {
        var now = DateTime.UtcNow;
        var clientLimit = _clientLimits.GetOrAdd(clientId, _ => new ClientRateLimit());

        lock (clientLimit)
        {
            // Clean up old entries
            clientLimit.RequestTimes.RemoveAll(time => now - time > TimeSpan.FromHours(1));

            // Count requests in the last minute and hour
            var requestsLastMinute = clientLimit.RequestTimes.Count(time => now - time <= TimeSpan.FromMinutes(1));
            var requestsLastHour = clientLimit.RequestTimes.Count;

            // Check limits
            if (requestsLastMinute >= _maxRequestsPerMinute)
            {
                _logger.LogWarning("Client {ClientId} exceeded per-minute rate limit: {Count}/{Limit} (Request: {RequestId})", 
                    clientId, requestsLastMinute, _maxRequestsPerMinute, requestId);
                
                _ = Task.Run(() => LogRateLimitViolationAsync("Per-minute rate limit exceeded", clientId, requestId, context));
                _ = Task.Run(() => WriteRateLimitResponseAsync(context, "Too many requests per minute", requestId));
                return false;
            }

            if (requestsLastHour >= _maxRequestsPerHour)
            {
                _logger.LogWarning("Client {ClientId} exceeded per-hour rate limit: {Count}/{Limit} (Request: {RequestId})", 
                    clientId, requestsLastHour, _maxRequestsPerHour, requestId);
                
                _ = Task.Run(() => LogRateLimitViolationAsync("Per-hour rate limit exceeded", clientId, requestId, context));
                _ = Task.Run(() => WriteRateLimitResponseAsync(context, "Too many requests per hour", requestId));
                return false;
            }

            // Add current request time
            clientLimit.RequestTimes.Add(now);
        }

        return true;
    }

    /// <summary>
    /// Checks session-based rate limits for file uploads
    /// </summary>
    private async Task<bool> CheckSessionRateLimitAsync(string sessionId, string requestId, HttpContext context)
    {
        var now = DateTime.UtcNow;
        var sessionLimit = _sessionLimits.GetOrAdd(sessionId, _ => new SessionRateLimit());

        lock (sessionLimit)
        {
            // Clean up old entries (files uploaded more than 1 hour ago)
            sessionLimit.FileUploadTimes.RemoveAll(time => now - time > TimeSpan.FromHours(1));

            // Check file upload limit
            if (sessionLimit.FileUploadTimes.Count >= _maxFilesPerSession)
            {
                _logger.LogWarning("Session {SessionId} exceeded file upload limit: {Count}/{Limit} (Request: {RequestId})", 
                    sessionId, sessionLimit.FileUploadTimes.Count, _maxFilesPerSession, requestId);
                
                _ = Task.Run(() => LogRateLimitViolationAsync("Session file upload limit exceeded", sessionId, requestId, context));
                _ = Task.Run(() => WriteRateLimitResponseAsync(context, "Too many files uploaded for this session", requestId));
                return false;
            }

            // Add current upload time
            sessionLimit.FileUploadTimes.Add(now);
        }

        return true;
    }

    /// <summary>
    /// Logs a rate limit violation
    /// </summary>
    private async Task LogRateLimitViolationAsync(string description, string identifier, string requestId, HttpContext context)
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
                    { "Identifier", identifier },
                    { "RemoteIpAddress", context.Connection.RemoteIpAddress?.ToString() ?? "Unknown" },
                    { "UserAgent", context.Request.Headers["User-Agent"].ToString() },
                    { "RequestPath", context.Request.Path.ToString() },
                    { "RequestMethod", context.Request.Method }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log rate limit violation (Request: {RequestId})", requestId);
        }
    }

    /// <summary>
    /// Writes a rate limit exceeded response
    /// </summary>
    private static async Task WriteRateLimitResponseAsync(HttpContext context, string message, string requestId)
    {
        context.Response.StatusCode = 429; // Too Many Requests
        context.Response.ContentType = "application/json";

        var response = new
        {
            Error = "RateLimitExceeded",
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
            Message = "An error occurred during rate limiting check",
            RequestId = requestId,
            Timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(response));
    }

    /// <summary>
    /// Cleanup task for expired rate limiting entries
    /// </summary>
    private async Task CleanupExpiredEntriesAsync()
    {
        while (true)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(5)); // Cleanup every 5 minutes

                var now = DateTime.UtcNow;
                var expiredClients = new List<string>();
                var expiredSessions = new List<string>();

                // Find expired client entries
                foreach (var kvp in _clientLimits)
                {
                    lock (kvp.Value)
                    {
                        kvp.Value.RequestTimes.RemoveAll(time => now - time > TimeSpan.FromHours(1));
                        if (kvp.Value.RequestTimes.Count == 0)
                        {
                            expiredClients.Add(kvp.Key);
                        }
                    }
                }

                // Find expired session entries
                foreach (var kvp in _sessionLimits)
                {
                    lock (kvp.Value)
                    {
                        kvp.Value.FileUploadTimes.RemoveAll(time => now - time > TimeSpan.FromHours(1));
                        if (kvp.Value.FileUploadTimes.Count == 0)
                        {
                            expiredSessions.Add(kvp.Key);
                        }
                    }
                }

                // Remove expired entries
                foreach (var clientId in expiredClients)
                {
                    _clientLimits.TryRemove(clientId, out _);
                }

                foreach (var sessionId in expiredSessions)
                {
                    _sessionLimits.TryRemove(sessionId, out _);
                }

                if (expiredClients.Count > 0 || expiredSessions.Count > 0)
                {
                    _logger.LogDebug("Cleaned up {ClientCount} expired client entries and {SessionCount} expired session entries", 
                        expiredClients.Count, expiredSessions.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during rate limiting cleanup");
            }
        }
    }

    /// <summary>
    /// Rate limiting data for a client
    /// </summary>
    private class ClientRateLimit
    {
        public List<DateTime> RequestTimes { get; } = new();
    }

    /// <summary>
    /// Rate limiting data for a session
    /// </summary>
    private class SessionRateLimit
    {
        public List<DateTime> FileUploadTimes { get; } = new();
    }
}