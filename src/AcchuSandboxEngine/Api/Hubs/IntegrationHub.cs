using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using AcchuSandboxEngine.Api.Models;
using System.Collections.Concurrent;

namespace AcchuSandboxEngine.Api.Hubs;

/// <summary>
/// SignalR hub for real-time communication between customer mobile and shopkeeper web interfaces
/// Enables live status updates during the print workflow
/// </summary>
public class IntegrationHub : Hub
{
    private readonly ILogger<IntegrationHub> _logger;
    private static readonly ConcurrentDictionary<string, HashSet<string>> _sessionConnections = new();
    private static readonly ConcurrentDictionary<string, string> _connectionSessions = new();

    public IntegrationHub(ILogger<IntegrationHub> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Customer joins session for real-time updates
    /// </summary>
    public async Task JoinCustomerSession(string sessionId)
    {
        try
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"customer_{sessionId}");
            
            // Track connection
            _sessionConnections.AddOrUpdate(
                $"customer_{sessionId}",
                new HashSet<string> { Context.ConnectionId },
                (key, existing) => { existing.Add(Context.ConnectionId); return existing; }
            );
            
            _connectionSessions[Context.ConnectionId] = $"customer_{sessionId}";

            _logger.LogInformation("Customer connection {ConnectionId} joined session {SessionId}", 
                Context.ConnectionId, sessionId);

            // Send welcome message to customer
            await Clients.Caller.SendAsync("StatusUpdate", new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "CustomerConnected",
                Status = "Connected",
                Message = "Connected to print session. Upload your file to get started.",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining customer session {SessionId} for connection {ConnectionId}", 
                sessionId, Context.ConnectionId);
        }
    }

    /// <summary>
    /// Shopkeeper joins session for real-time updates
    /// </summary>
    public async Task JoinShopkeeperSession(string sessionId)
    {
        try
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"shopkeeper_{sessionId}");
            
            // Track connection
            _sessionConnections.AddOrUpdate(
                $"shopkeeper_{sessionId}",
                new HashSet<string> { Context.ConnectionId },
                (key, existing) => { existing.Add(Context.ConnectionId); return existing; }
            );
            
            _connectionSessions[Context.ConnectionId] = $"shopkeeper_{sessionId}";

            _logger.LogInformation("Shopkeeper connection {ConnectionId} joined session {SessionId}", 
                Context.ConnectionId, sessionId);

            // Send welcome message to shopkeeper
            await Clients.Caller.SendAsync("StatusUpdate", new StatusUpdate
            {
                SessionId = sessionId,
                EventType = "ShopkeeperConnected",
                Status = "Ready",
                Message = "Ready to receive customer files for printing.",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining shopkeeper session {SessionId} for connection {ConnectionId}", 
                sessionId, Context.ConnectionId);
        }
    }

    /// <summary>
    /// Handle client disconnection
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            if (_connectionSessions.TryRemove(Context.ConnectionId, out var sessionGroup))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionGroup);
                
                // Remove from session connections
                if (_sessionConnections.TryGetValue(sessionGroup, out var connections))
                {
                    connections.Remove(Context.ConnectionId);
                    if (connections.Count == 0)
                    {
                        _sessionConnections.TryRemove(sessionGroup, out _);
                    }
                }

                _logger.LogInformation("Connection {ConnectionId} disconnected from session group {SessionGroup}", 
                    Context.ConnectionId, sessionGroup);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling disconnection for connection {ConnectionId}", Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Send status update to all clients in a session
    /// </summary>
    public static async Task SendStatusUpdateToSession(IHubContext<IntegrationHub> hubContext, 
        string sessionId, StatusUpdate statusUpdate)
    {
        try
        {
            // Send to both customer and shopkeeper groups
            await hubContext.Clients.Groups($"customer_{sessionId}", $"shopkeeper_{sessionId}")
                .SendAsync("StatusUpdate", statusUpdate);
        }
        catch (Exception ex)
        {
            // Log error but don't throw - status updates are non-critical
            Console.WriteLine($"Error sending status update to session {sessionId}: {ex.Message}");
        }
    }

    /// <summary>
    /// Send update specifically to customer
    /// </summary>
    public static async Task SendCustomerUpdate(IHubContext<IntegrationHub> hubContext, 
        string sessionId, StatusUpdate statusUpdate)
    {
        try
        {
            await hubContext.Clients.Group($"customer_{sessionId}")
                .SendAsync("StatusUpdate", statusUpdate);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error sending customer update to session {sessionId}: {ex.Message}");
        }
    }

    /// <summary>
    /// Send update specifically to shopkeeper
    /// </summary>
    public static async Task SendShopkeeperUpdate(IHubContext<IntegrationHub> hubContext, 
        string sessionId, StatusUpdate statusUpdate)
    {
        try
        {
            await hubContext.Clients.Group($"shopkeeper_{sessionId}")
                .SendAsync("StatusUpdate", statusUpdate);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error sending shopkeeper update to session {sessionId}: {ex.Message}");
        }
    }

    /// <summary>
    /// Get active connection count for a session
    /// </summary>
    public static int GetActiveConnections(string sessionId)
    {
        var customerConnections = _sessionConnections.TryGetValue($"customer_{sessionId}", out var customerSet) 
            ? customerSet.Count : 0;
        var shopkeeperConnections = _sessionConnections.TryGetValue($"shopkeeper_{sessionId}", out var shopkeeperSet) 
            ? shopkeeperSet.Count : 0;
        
        return customerConnections + shopkeeperConnections;
    }
}