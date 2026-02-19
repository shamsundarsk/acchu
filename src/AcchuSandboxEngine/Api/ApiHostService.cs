using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Api.Middleware;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Services;

namespace AcchuSandboxEngine.Api;

/// <summary>
/// Hosted service that runs the API server for ACCHU Backend communication
/// Requirements: 2.1, 2.2, 2.3, 8.5
/// </summary>
public class ApiHostService : IHostedService
{
    private readonly ILogger<ApiHostService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly SecurityConfiguration _securityConfig;
    private WebApplication? _app;

    public ApiHostService(
        ILogger<ApiHostService> logger,
        IServiceProvider serviceProvider,
        IOptions<SecurityConfiguration> securityConfig)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
        _securityConfig = securityConfig.Value;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Starting API host service...");

            var builder = WebApplication.CreateBuilder();

            // Configure services
            ConfigureServices(builder.Services);

            // Build the application
            _app = builder.Build();

            // Configure the request pipeline
            ConfigurePipeline(_app);

            // Perform startup cleanup of orphaned sessions from previous runs
            await PerformStartupCleanupAsync();

            // Start the web application
            await _app.StartAsync(cancellationToken);

            _logger.LogInformation("API host service started successfully on {Urls}", 
                string.Join(", ", _app.Urls));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start API host service");
            throw;
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Stopping API host service...");

            if (_app != null)
            {
                await _app.StopAsync(cancellationToken);
                await _app.DisposeAsync();
                _app = null;
            }

            _logger.LogInformation("API host service stopped successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping API host service");
        }
    }

    /// <summary>
    /// Configures services for the API
    /// </summary>
    private void ConfigureServices(IServiceCollection services)
    {
        // Add controllers
        services.AddControllers()
            .AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
                options.JsonSerializerOptions.WriteIndented = false;
            });

        // Add API explorer for documentation
        services.AddEndpointsApiExplorer();

        // Add SignalR for real-time communication
        services.AddSignalR(options =>
        {
            options.EnableDetailedErrors = true;
            options.KeepAliveInterval = TimeSpan.FromSeconds(15);
            options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
        });

        // Configure CORS for ACCHU Backend and Integration
        services.AddCors(options =>
        {
            options.AddPolicy("AcchuBackendPolicy", policy =>
            {
                policy.WithOrigins("https://acchu-backend.local", "https://localhost:5001") // Configure actual backend URLs
                      .WithHeaders("Authorization", "Content-Type", "Accept")
                      .WithMethods("GET", "POST", "PUT", "DELETE")
                      .AllowCredentials();
            });
            
            options.AddPolicy("IntegrationPolicy", policy =>
            {
                policy.WithOrigins(
                    "http://localhost:5173", 
                    "http://localhost:3000", 
                    "http://localhost:5000", 
                    "http://localhost:3001",
                    "https://customer-deploy-silk.vercel.app",
                    "https://frontend-web-beta-wheat.vercel.app"
                ) // Frontend origins including deployed apps
                      .WithHeaders("Authorization", "Content-Type", "Accept", "X-Requested-With", "ngrok-skip-browser-warning")
                      .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                      .AllowCredentials();
            });
        });

        // Configure JWT authentication
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = _securityConfig.ValidateIssuer,
                    ValidateAudience = _securityConfig.ValidateAudience,
                    ValidateLifetime = _securityConfig.ValidateLifetime,
                    ValidateIssuerSigningKey = _securityConfig.ValidateIssuerSigningKey,
                    ValidIssuer = _securityConfig.JwtIssuer,
                    ValidAudience = _securityConfig.JwtAudience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_securityConfig.JwtSecretKey)),
                    ClockSkew = TimeSpan.FromMinutes(5) // Allow 5 minutes clock skew
                };

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<ApiHostService>>();
                        logger.LogWarning("JWT authentication failed: {Error}", context.Exception.Message);
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = context =>
                    {
                        var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<ApiHostService>>();
                        logger.LogDebug("JWT token validated successfully for user: {User}", 
                            context.Principal?.Identity?.Name ?? "Unknown");
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();

        // Add health checks
        services.AddHealthChecks();

        // Copy existing services from the main service provider
        CopyExistingServices(services);

        // Configure Kestrel server
        services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(options =>
        {
            options.ListenLocalhost(8080); // HTTP port for internal communication
            options.ListenLocalhost(8443, listenOptions =>
            {
                // HTTPS port - in production, configure with proper certificates
                listenOptions.UseHttps();
            });
        });
    }

    /// <summary>
    /// Copies existing services from the main service provider
    /// </summary>
    private void CopyExistingServices(IServiceCollection services)
    {
        // Copy existing services from the main service provider
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<ISessionManager>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<ISecurityManager>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IFileSystemManager>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IPrintManager>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<ICleanupManager>());

        // Copy monitoring and diagnostics services (temporarily disabled for demo)
        // services.AddSingleton(provider => _serviceProvider.GetRequiredService<MonitoringService>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<DiagnosticsService>());

        // Copy integration service - register fresh instance in web context instead of copying
        services.AddScoped<AcchuSandboxEngine.Services.IntegrationService>();

        // Copy configuration
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IOptions<SecurityConfiguration>>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IOptions<SandboxConfiguration>>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IOptions<PrintConfiguration>>());
        services.AddSingleton(provider => _serviceProvider.GetRequiredService<IOptions<AcchuSandboxEngine.Api.Models.IntegrationConfig>>());
    }

    /// <summary>
    /// Configures the request pipeline
    /// </summary>
    private void ConfigurePipeline(WebApplication app)
    {
        // Add security headers
        app.Use(async (context, next) =>
        {
            context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
            context.Response.Headers.Add("X-Frame-Options", "DENY");
            context.Response.Headers.Add("X-XSS-Protection", "1; mode=block");
            context.Response.Headers.Add("Referrer-Policy", "strict-origin-when-cross-origin");
            context.Response.Headers.Add("Content-Security-Policy", "default-src 'self'");
            
            await next();
        });

        // Add CORS first (before authentication)
        app.UseCors("IntegrationPolicy");

        // Add custom middleware
        app.UseMiddleware<JwtAuthenticationMiddleware>();
        app.UseMiddleware<RateLimitingMiddleware>();

        // Add authentication and authorization
        app.UseAuthentication();
        app.UseAuthorization();

        // Add health check endpoints
        app.MapHealthChecks("/api/health");

        // Map controllers
        app.MapControllers();

        // Map SignalR hub for integration
        app.MapHub<AcchuSandboxEngine.Api.Hubs.IntegrationHub>("/integration-hub");

        // Add global exception handling
        app.UseExceptionHandler(errorApp =>
        {
            errorApp.Run(async context =>
            {
                var logger = context.RequestServices.GetRequiredService<ILogger<ApiHostService>>();
                var requestId = context.Items["RequestId"]?.ToString() ?? Guid.NewGuid().ToString("N")[..8];
                
                logger.LogError("Unhandled exception in API request (Request: {RequestId})", requestId);

                context.Response.StatusCode = 500;
                context.Response.ContentType = "application/json";

                var response = new
                {
                    Error = "InternalError",
                    Message = "An unexpected error occurred",
                    RequestId = requestId,
                    Timestamp = DateTime.UtcNow
                };

                await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(response));
            });
        });
    }

    /// <summary>
    /// Performs startup cleanup of orphaned sessions from previous runs
    /// </summary>
    private async Task PerformStartupCleanupAsync()
    {
        try
        {
            _logger.LogInformation("Performing startup cleanup of orphaned sessions...");

            var sessionManager = _serviceProvider.GetRequiredService<ISessionManager>();
            var fileSystemManager = _serviceProvider.GetRequiredService<IFileSystemManager>();
            var sandboxConfig = _serviceProvider.GetRequiredService<IOptions<SandboxConfiguration>>().Value;

            // Get the temp directory path
            var tempDir = Environment.ExpandEnvironmentVariables(sandboxConfig.TempDirectoryRoot);
            var sandboxDir = tempDir; // TempDirectoryRoot already includes AcchuSandbox

            _logger.LogInformation("Looking for sandbox directory at: {SandboxDir}", sandboxDir);

            if (!Directory.Exists(sandboxDir))
            {
                _logger.LogInformation("No sandbox directory found, skipping startup cleanup");
                return;
            }

            // Find all session directories
            var sessionDirs = Directory.GetDirectories(sandboxDir, "acchu_sandbox_*");
            _logger.LogInformation("Found {Count} session directories to evaluate for cleanup", sessionDirs.Length);

            var cleanedCount = 0;
            var failedCount = 0;

            foreach (var sessionDir in sessionDirs)
            {
                try
                {
                    var dirInfo = new DirectoryInfo(sessionDir);
                    var sessionAge = DateTime.UtcNow - dirInfo.CreationTime;

                    // Clean up sessions older than the configured timeout plus a buffer
                    var maxAge = TimeSpan.FromMinutes(sandboxConfig.MaxSessionDurationMinutes + 30);

                    if (sessionAge > maxAge)
                    {
                        _logger.LogInformation("Cleaning up old session directory: {SessionDir} (Age: {Age})", 
                            sessionDir, sessionAge);

                        // Extract session ID from directory name for logging
                        var dirName = Path.GetFileName(sessionDir);
                        var sessionId = ExtractSessionIdFromDirectoryName(dirName);

                        // For startup cleanup of orphaned directories, use direct deletion
                        // since these directories may not be tracked in the session manager
                        try
                        {
                            Directory.Delete(sessionDir, true);
                            cleanedCount++;
                            _logger.LogInformation("Successfully cleaned up orphaned session directory: {SessionDir}", sessionDir);
                        }
                        catch (Exception deleteEx)
                        {
                            failedCount++;
                            _logger.LogWarning("Failed to clean up session directory {SessionDir}: {Error}", 
                                sessionDir, deleteEx.Message);
                        }
                    }
                    else
                    {
                        _logger.LogDebug("Session directory {SessionDir} is recent (Age: {Age}), keeping", 
                            sessionDir, sessionAge);
                    }
                }
                catch (Exception ex)
                {
                    failedCount++;
                    _logger.LogError(ex, "Error processing session directory: {SessionDir}", sessionDir);
                }
            }

            _logger.LogInformation("Startup cleanup completed. Cleaned: {CleanedCount}, Failed: {FailedCount}, Total: {TotalCount}", 
                cleanedCount, failedCount, sessionDirs.Length);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during startup cleanup");
            // Don't throw - startup cleanup failure shouldn't prevent service start
        }
    }

    /// <summary>
    /// Extracts session ID from directory name
    /// </summary>
    private string? ExtractSessionIdFromDirectoryName(string dirName)
    {
        try
        {
            // Directory format examples:
            // acchu_sandbox_session_shop_demo_1769924943988_ml3bm35h_064bb684c53f4e29a0239f27f3292d17
            // acchu_sandbox_shop_shop001_20260131_152925_a3026a66_da6f075f40d4435ea4faf9ba0a91b3ec
            // acchu_sandbox_test-cors-session_f14ba5d2e5d14cf698438612e4f07b7a
            
            if (dirName.StartsWith("acchu_sandbox_"))
            {
                var withoutPrefix = dirName.Substring("acchu_sandbox_".Length);
                
                // Find the last underscore followed by a GUID-like string (32 hex chars)
                var parts = withoutPrefix.Split('_');
                if (parts.Length >= 2)
                {
                    var lastPart = parts[parts.Length - 1];
                    // Check if last part looks like a GUID (32 hex characters)
                    if (lastPart.Length == 32 && lastPart.All(c => char.IsLetterOrDigit(c)))
                    {
                        // Remove the GUID part and rejoin
                        var sessionParts = parts.Take(parts.Length - 1);
                        return string.Join("_", sessionParts);
                    }
                }
                
                // Fallback: use the whole string without prefix
                return withoutPrefix;
            }
            return null;
        }
        catch
        {
            return null;
        }
    }
}