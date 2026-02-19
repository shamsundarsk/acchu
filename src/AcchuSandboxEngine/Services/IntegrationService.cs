using AcchuSandboxEngine.Api.Models;
using AcchuSandboxEngine.Api.Hubs;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.Text.Json;

namespace AcchuSandboxEngine.Services;

/// <summary>
/// Integration service that coordinates between AcchuSandboxEngine and frontend systems
/// Handles session lifecycle, file management, and real-time updates
/// </summary>
public class IntegrationService
{
    private readonly ILogger<IntegrationService> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly IHubContext<IntegrationHub> _hubContext;
    private readonly IntegrationConfig _config;
    
    // Track session metadata for integration
    private readonly ConcurrentDictionary<string, SessionMetadata> _sessionMetadata = new();
    private readonly ConcurrentDictionary<string, List<CustomerFile>> _sessionFiles = new();

    public IntegrationService(
        ILogger<IntegrationService> logger,
        ISessionManager sessionManager,
        IHubContext<IntegrationHub> hubContext,
        IOptions<IntegrationConfig> config)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _hubContext = hubContext;
        _config = config.Value;
    }

    /// <summary>
    /// Initialize a session for integration (called when QR is generated)
    /// </summary>
    public async Task<bool> InitializeSessionAsync(string sessionId, string shopkeeperId, string shopName)
    {
        try
        {
            _logger.LogInformation("Initializing integration session {SessionId} for shopkeeper {ShopkeeperId}", 
                sessionId, shopkeeperId);

            var metadata = new SessionMetadata
            {
                SessionId = sessionId,
                ShopkeeperId = shopkeeperId,
                ShopName = shopName,
                CreatedAt = DateTime.UtcNow,
                Status = "Initialized",
                Files = new List<CustomerFile>()
            };

            _sessionMetadata[sessionId] = metadata;
            _sessionFiles[sessionId] = new List<CustomerFile>();

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initializing integration session {SessionId}", sessionId);
            return false;
        }
    }

    /// <summary>
    /// Handle customer file upload with real-time updates
    /// </summary>
    public async Task<CustomerUploadResponse> HandleCustomerUploadAsync(
        string sessionId, 
        string fileName, 
        long fileSize, 
        PrintPreferences preferences,
        string? customerName = null,
        string? customerPhone = null)
    {
        try
        {
            _logger.LogInformation("Handling customer upload for file {FileName} in session {SessionId}", 
                fileName, sessionId);

            // Update session metadata
            if (_sessionMetadata.TryGetValue(sessionId, out var metadata))
            {
                metadata.Status = "FileReceived";
                metadata.LastActivity = DateTime.UtcNow;
                if (!string.IsNullOrEmpty(customerName))
                {
                    metadata.CustomerName = customerName;
                }
                if (!string.IsNullOrEmpty(customerPhone))
                {
                    metadata.CustomerPhone = customerPhone;
                }
            }

            // Create customer file record
            var customerFile = new CustomerFile
            {
                FileName = fileName,
                FileSize = fileSize,
                Status = "Uploaded",
                UploadedAt = DateTime.UtcNow,
                PrintPreferences = preferences,
                Cost = CalculateCost(fileSize, preferences)
            };

            // Add to session files
            if (_sessionFiles.TryGetValue(sessionId, out var files))
            {
                files.Add(customerFile);
            }

            // Send real-time update to shopkeeper
            await IntegrationHub.SendShopkeeperUpdate(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "FileUploaded",
                FileName = fileName,
                Status = "Ready to Print",
                Message = $"Customer uploaded {fileName} - ready for printing",
                Timestamp = DateTime.UtcNow,
                Data = new Dictionary<string, object>
                {
                    { "fileSize", fileSize },
                    { "preferences", preferences },
                    { "estimatedCost", customerFile.Cost }
                }
            });

            // Send confirmation to customer
            await IntegrationHub.SendCustomerUpdate(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "FileUploaded",
                FileName = fileName,
                Status = "Uploaded",
                Message = "File uploaded successfully. Waiting for shopkeeper to print.",
                Timestamp = DateTime.UtcNow,
                Data = new Dictionary<string, object>
                {
                    { "estimatedCost", customerFile.Cost }
                }
            });

            return new CustomerUploadResponse
            {
                Success = true,
                SessionId = sessionId,
                FileName = fileName,
                FileSize = fileSize,
                PrintPreferences = preferences,
                EstimatedCost = customerFile.Cost,
                Message = "File uploaded successfully. Please wait for shopkeeper to print."
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling customer upload for session {SessionId}", sessionId);
            
            // Send error update to customer
            await IntegrationHub.SendCustomerUpdate(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "UploadFailed",
                FileName = fileName,
                Status = "Failed",
                Message = "File upload failed. Please try again.",
                Timestamp = DateTime.UtcNow
            });

            return new CustomerUploadResponse
            {
                Success = false,
                ErrorMessage = "File upload failed. Please try again."
            };
        }
    }

    /// <summary>
    /// Handle shopkeeper print execution with real-time updates
    /// </summary>
    public async Task<ShopkeeperPrintResponse> HandleShopkeeperPrintAsync(string sessionId, string fileName)
    {
        try
        {
            _logger.LogInformation("Handling shopkeeper print for file {FileName} in session {SessionId}", 
                fileName, sessionId);

            // Update file status to printing
            if (_sessionFiles.TryGetValue(sessionId, out var files))
            {
                var file = files.FirstOrDefault(f => f.FileName == fileName);
                if (file != null)
                {
                    file.Status = "Printing";
                }
            }

            // Send real-time updates
            await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "PrintStarted",
                FileName = fileName,
                Status = "Printing",
                Message = $"Printing {fileName}...",
                Timestamp = DateTime.UtcNow
            });

            // Simulate print completion (in real implementation, this would be triggered by print job completion)
            _ = Task.Run(async () =>
            {
                await Task.Delay(5000); // Simulate print time
                await HandlePrintCompletionAsync(sessionId, fileName, true);
            });

            return new ShopkeeperPrintResponse
            {
                Success = true,
                JobId = new Random().Next(1000, 9999), // Generate job ID
                FileName = fileName,
                Status = "Printing",
                Message = "Print job started successfully",
                PrintedAt = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling shopkeeper print for session {SessionId}", sessionId);
            
            await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "PrintFailed",
                FileName = fileName,
                Status = "Failed",
                Message = "Print job failed. Please try again.",
                Timestamp = DateTime.UtcNow
            });

            return new ShopkeeperPrintResponse
            {
                Success = false,
                ErrorMessage = "Print job failed. Please try again."
            };
        }
    }

    /// <summary>
    /// Handle print completion and trigger cleanup
    /// </summary>
    public async Task HandlePrintCompletionAsync(string sessionId, string fileName, bool success)
    {
        try
        {
            _logger.LogInformation("Handling print completion for file {FileName} in session {SessionId}, success: {Success}", 
                fileName, sessionId, success);

            // Update file status
            if (_sessionFiles.TryGetValue(sessionId, out var files))
            {
                var file = files.FirstOrDefault(f => f.FileName == fileName);
                if (file != null)
                {
                    file.Status = success ? "Printed" : "Failed";
                    file.PrintedAt = DateTime.UtcNow;
                }
            }

            if (success)
            {
                // Send success updates
                await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
                {
                    SessionId = sessionId,
                    EventType = "PrintCompleted",
                    FileName = fileName,
                    Status = "Completed",
                    Message = $"{fileName} printed successfully!",
                    Timestamp = DateTime.UtcNow
                });

                // Trigger cleanup after successful print
                await Task.Delay(2000); // Give time for status updates
                await HandleSessionCleanupAsync(sessionId);
            }
            else
            {
                await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
                {
                    SessionId = sessionId,
                    EventType = "PrintFailed",
                    FileName = fileName,
                    Status = "Failed",
                    Message = $"Failed to print {fileName}. Please try again.",
                    Timestamp = DateTime.UtcNow
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling print completion for session {SessionId}", sessionId);
        }
    }

    /// <summary>
    /// Handle session cleanup with real-time updates
    /// </summary>
    public async Task HandleSessionCleanupAsync(string sessionId)
    {
        try
        {
            _logger.LogInformation("Handling session cleanup for session {SessionId}", sessionId);

            // Send cleanup notification
            await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "CleanupStarted",
                Status = "Cleaning",
                Message = "Cleaning up session data for privacy...",
                Timestamp = DateTime.UtcNow
            });

            // Trigger actual cleanup in your engine
            await _sessionManager.EndSessionAsync(sessionId);

            // Clean up integration metadata
            _sessionMetadata.TryRemove(sessionId, out _);
            _sessionFiles.TryRemove(sessionId, out _);

            // Send final cleanup notification
            await IntegrationHub.SendStatusUpdateToSession(_hubContext, sessionId, new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "SessionEnded",
                Status = "Completed",
                Message = "Session completed. All data has been securely deleted.",
                Timestamp = DateTime.UtcNow
            });

            _logger.LogInformation("Session cleanup completed for session {SessionId}", sessionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling session cleanup for session {SessionId}", sessionId);
        }
    }

    /// <summary>
    /// Get pending jobs for shopkeeper interface
    /// </summary>
    public async Task<List<PendingJob>> GetPendingJobsAsync(string sessionId)
    {
        try
        {
            if (!_sessionFiles.TryGetValue(sessionId, out var files))
            {
                return new List<PendingJob>();
            }

            return files.Where(f => f.Status == "Uploaded")
                       .Select(f => new PendingJob
                       {
                           FileName = f.FileName,
                           FileSize = f.FileSize,
                           ReceivedAt = f.UploadedAt,
                           PrintPreferences = f.PrintPreferences,
                           EstimatedCost = f.Cost,
                           Status = f.Status
                       })
                       .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending jobs for session {SessionId}", sessionId);
            return new List<PendingJob>();
        }
    }

    /// <summary>
    /// Get customer status
    /// </summary>
    public async Task<CustomerStatusResponse> GetCustomerStatusAsync(string sessionId)
    {
        try
        {
            if (!_sessionMetadata.TryGetValue(sessionId, out var metadata) ||
                !_sessionFiles.TryGetValue(sessionId, out var files))
            {
                return new CustomerStatusResponse
                {
                    Success = false,
                    ErrorMessage = "Session not found"
                };
            }

            return new CustomerStatusResponse
            {
                Success = true,
                SessionId = sessionId,
                Status = metadata.Status,
                Message = GetStatusMessage(metadata.Status),
                LastUpdated = metadata.LastActivity,
                Files = files.ToList()
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting customer status for session {SessionId}", sessionId);
            return new CustomerStatusResponse
            {
                Success = false,
                ErrorMessage = "Error retrieving status"
            };
        }
    }

    // Helper methods
    private decimal CalculateCost(long fileSize, PrintPreferences preferences)
    {
        // Estimate pages based on file size (rough approximation)
        var estimatedPages = Math.Max(1, (int)(fileSize / 50000)); // ~50KB per page
        
        decimal costPerPage = preferences.ColorMode == "color" ? _config.Pricing.ColorPerPage : _config.Pricing.BlackWhitePerPage;
        
        // Duplex not implemented yet, so no discount
        
        return (costPerPage * estimatedPages * preferences.Copies) + _config.Pricing.ServiceFee;
    }

    private string GetStatusMessage(string status)
    {
        return status switch
        {
            "Initialized" => "Session ready. Waiting for file upload.",
            "FileReceived" => "File received. Waiting for shopkeeper to print.",
            "Printing" => "Your document is being printed.",
            "Completed" => "Print job completed successfully.",
            "Failed" => "Print job failed. Please try again.",
            _ => "Unknown status"
        };
    }
}

/// <summary>
/// Session metadata for integration tracking
/// </summary>
public class SessionMetadata
{
    public string SessionId { get; set; } = string.Empty;
    public string ShopkeeperId { get; set; } = string.Empty;
    public string ShopName { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<CustomerFile> Files { get; set; } = new();
}