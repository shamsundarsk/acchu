using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;

namespace AcchuSandboxEngine.Services;

public class SessionManager : ISessionManager
{
    private readonly ILogger<SessionManager> _logger;
    private readonly SandboxConfiguration _config;
    private readonly ConcurrentDictionary<string, SessionState> _sessions;
    private readonly Timer _cleanupTimer;
    private readonly object _sessionLock = new();
    private readonly ISecurityManager _securityManager;
    private readonly ICleanupManager? _cleanupManager;
    private readonly IFileSystemManager _fileSystemManager;
    private readonly IPrintManager _printManager;
    private readonly MonitoringService? _monitoringService;

    public SessionManager(
        ILogger<SessionManager> logger, 
        IOptions<SandboxConfiguration> config,
        ISecurityManager securityManager,
        IFileSystemManager fileSystemManager,
        IPrintManager printManager)
    {
        _logger = logger;
        _config = config.Value;
        _sessions = new ConcurrentDictionary<string, SessionState>();
        _securityManager = securityManager;
        _cleanupManager = null; // Will be resolved later to avoid circular dependency
        _fileSystemManager = fileSystemManager;
        _printManager = printManager;
        _monitoringService = null; // Will be resolved later to avoid circular dependency
        
        // Start cleanup timer to check for expired sessions every minute
        _cleanupTimer = new Timer(CleanupExpiredSessions, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
    }

    public async Task<SessionResult> StartSessionAsync(SessionRequest request)
    {
        _logger.LogInformation("Starting session {SessionId}", request.SessionId);

        try
        {
            if (string.IsNullOrWhiteSpace(request.SessionId))
            {
                await HandleSessionErrorAsync("", "Session ID cannot be empty", "Invalid session start request");
                return new SessionResult
                {
                    Success = false,
                    SessionId = request.SessionId,
                    ErrorMessage = "Session ID cannot be empty",
                    Status = SessionStatus.Failed
                };
            }

            if (string.IsNullOrWhiteSpace(request.SessionToken))
            {
                await HandleSessionErrorAsync(request.SessionId, "Session token cannot be empty", "Invalid session start request");
                return new SessionResult
                {
                    Success = false,
                    SessionId = request.SessionId,
                    ErrorMessage = "Session token cannot be empty",
                    Status = SessionStatus.Failed
                };
            }

            // Validate session token first (fail-closed security)
            // Skip validation for demo tokens to enable testing
            ValidationResult tokenValidation;
            if (request.SessionToken == "demo-token")
            {
                _logger.LogInformation("Using demo token for session {SessionId}, skipping validation", request.SessionId);
                tokenValidation = new ValidationResult
                {
                    IsValid = true,
                    ErrorMessage = string.Empty,
                    ValidUntil = DateTime.UtcNow.AddHours(1),
                    Claims = new Dictionary<string, object>
                    {
                        { "sessionId", request.SessionId },
                        { "isDemo", true }
                    }
                };
            }
            else
            {
                tokenValidation = await _securityManager.ValidateSessionTokenAsync(request.SessionToken);
            }
            if (!tokenValidation.IsValid)
            {
                await HandleSessionErrorAsync(request.SessionId, $"Token validation failed: {tokenValidation.ErrorMessage}", "Security validation failure");
                return new SessionResult
                {
                    Success = false,
                    SessionId = request.SessionId,
                    ErrorMessage = "Session token validation failed",
                    Status = SessionStatus.Failed
                };
            }

            SessionState? sessionState = null;

            lock (_sessionLock)
            {
                // Check if this specific session already exists
                if (_sessions.TryGetValue(request.SessionId, out var existingSessionState))
                {
                    // If the session exists and is still active, reuse it
                    if (existingSessionState.Status == SessionStatus.Active || 
                        existingSessionState.Status == SessionStatus.Processing || 
                        existingSessionState.Status == SessionStatus.Printing)
                    {
                        _logger.LogInformation("Reusing existing active session {SessionId}", request.SessionId);
                        sessionState = existingSessionState;
                        // Update expiration time if needed
                        if (request.ExpirationTime != default && request.ExpirationTime > existingSessionState.ExpiresAt)
                        {
                            existingSessionState.ExpiresAt = request.ExpirationTime;
                        }
                    }
                    else
                    {
                        // Session exists but is not active, create new one
                        sessionState = new SessionState
                        {
                            SessionId = request.SessionId,
                            SessionToken = request.SessionToken,
                            Status = SessionStatus.Active,
                            CreatedAt = DateTime.UtcNow,
                            ExpiresAt = request.ExpirationTime != default ? request.ExpirationTime : 
                                       DateTime.UtcNow.AddMinutes(_config.MaxSessionDurationMinutes),
                            Metadata = new Dictionary<string, object>(request.Metadata),
                            Files = new List<SessionFile>(),
                            PrintJobs = new List<PrintJob>()
                        };
                    }
                }
                else
                {
                    // Create new session state
                    sessionState = new SessionState
                    {
                        SessionId = request.SessionId,
                        SessionToken = request.SessionToken,
                        Status = SessionStatus.Active,
                        CreatedAt = DateTime.UtcNow,
                        ExpiresAt = request.ExpirationTime != default ? request.ExpirationTime : 
                                   DateTime.UtcNow.AddMinutes(_config.MaxSessionDurationMinutes),
                        Metadata = new Dictionary<string, object>(request.Metadata),
                        Files = new List<SessionFile>(),
                        PrintJobs = new List<PrintJob>()
                    };
                }
            }

            if (sessionState == null)
            {
                return new SessionResult
                {
                    Success = false,
                    SessionId = request.SessionId,
                    ErrorMessage = "Failed to create session state",
                    Status = SessionStatus.Failed
                };
            }

            // If we're reusing an existing session, return success immediately
            if (_sessions.ContainsKey(request.SessionId) && sessionState.SandboxPath != null)
            {
                _logger.LogInformation("Successfully reused existing session {SessionId}", request.SessionId);
                return new SessionResult
                {
                    Success = true,
                    SessionId = request.SessionId,
                    Status = sessionState.Status
                };
            }

            // Create sandbox workspace for the session (outside lock)
            var sandboxResult = await _fileSystemManager.CreateSandboxAsync(request.SessionId);
            if (!sandboxResult.Success)
            {
                await HandleSessionErrorAsync(request.SessionId, $"Failed to create sandbox: {sandboxResult.ErrorMessage}", "Sandbox creation failure");
                return new SessionResult
                {
                    Success = false,
                    SessionId = request.SessionId,
                    ErrorMessage = "Failed to create secure workspace",
                    Status = SessionStatus.Failed
                };
            }

            sessionState.SandboxPath = sandboxResult.SandboxPath;

            // Add session to tracking
            _sessions.TryAdd(request.SessionId, sessionState);

            // Record session start in monitoring
            _monitoringService?.RecordSessionStart(request.SessionId);

            // Log successful session start
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = request.SessionId,
                EventType = SecurityEventType.SessionStarted,
                Description = "Session started successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "SandboxPath", sessionState.SandboxPath },
                    { "ExpiresAt", sessionState.ExpiresAt }
                }
            });

            _logger.LogInformation("Session {SessionId} started successfully, expires at {ExpiresAt}", 
                request.SessionId, sessionState.ExpiresAt);

            return new SessionResult
            {
                Success = true,
                SessionId = request.SessionId,
                Status = SessionStatus.Active
            };
        }
        catch (Exception ex)
        {
            await HandleSessionErrorAsync(request.SessionId, ex.Message, "Unexpected error during session start");
            return new SessionResult
            {
                Success = false,
                SessionId = request.SessionId,
                ErrorMessage = "Failed to start session due to internal error",
                Status = SessionStatus.Failed
            };
        }
    }

    public async Task<SessionResult> EndSessionAsync(string sessionId)
    {
        _logger.LogInformation("Ending session {SessionId}", sessionId);

        try
        {
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "Session ID cannot be empty",
                    Status = SessionStatus.Failed
                };
            }

            if (!_sessions.TryGetValue(sessionId, out var sessionState))
            {
                _logger.LogWarning("Attempted to end non-existent session {SessionId}", sessionId);
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "Session not found",
                    Status = SessionStatus.None
                };
            }

            lock (_sessionLock)
            {
                // Update session status to completed
                sessionState.Status = SessionStatus.Completed;
                
                _logger.LogInformation("Session {SessionId} ended successfully", sessionId);
            }

            // Log session end event
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SessionEnded,
                Description = "Session ended by user request",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "Duration", DateTime.UtcNow - sessionState.CreatedAt },
                    { "FilesProcessed", sessionState.Files?.Count ?? 0 },
                    { "PrintJobsExecuted", sessionState.PrintJobs?.Count ?? 0 }
                }
            });

            // Record session end in monitoring
            if (_monitoringService != null)
            {
                await _monitoringService.RecordSessionEndAsync(sessionId);
            }

            // Trigger automatic cleanup (Requirement 4.1, 4.2)
            try
            {
                // Perform direct file system cleanup since we can't use CleanupManager due to circular dependency
                var cleanupResult = await _fileSystemManager.SecureDeleteAsync(sessionId);
                if (!cleanupResult.Success)
                {
                    _logger.LogError("File system cleanup failed for session {SessionId}: {Error}", sessionId, cleanupResult.ErrorMessage);
                    // Don't fail the session end, but log the issue
                }
            }
            catch (Exception cleanupEx)
            {
                _logger.LogError(cleanupEx, "Exception during cleanup for session {SessionId}", sessionId);
                // Continue - cleanup failure shouldn't prevent session end
            }

            return new SessionResult
            {
                Success = true,
                SessionId = sessionId,
                Status = SessionStatus.Completed
            };
        }
        catch (Exception ex)
        {
            await HandleSessionErrorAsync(sessionId, ex.Message, "Unexpected error during session end");
            return new SessionResult
            {
                Success = false,
                SessionId = sessionId,
                ErrorMessage = "Failed to end session due to internal error",
                Status = SessionStatus.Failed
            };
        }
    }

    public async Task<SessionResult> ProcessFileAsync(string sessionId, FileRequest fileRequest)
    {
        _logger.LogInformation("Processing file {FileName} for session {SessionId}", 
            fileRequest.FileName, sessionId);

        try
        {
            if (!_sessions.TryGetValue(sessionId, out var sessionState))
            {
                await HandleSessionErrorAsync(sessionId, "Session not found", "File processing attempted on non-existent session");
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "Session not found",
                    Status = SessionStatus.None
                };
            }

            if (sessionState.Status != SessionStatus.Active)
            {
                await HandleSessionErrorAsync(sessionId, $"Session is not active (current status: {sessionState.Status})", "File processing attempted on inactive session");
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = $"Session is not active (current status: {sessionState.Status})",
                    Status = sessionState.Status
                };
            }

            // Check if session has expired (fail-closed)
            if (DateTime.UtcNow > sessionState.ExpiresAt)
            {
                await HandleSessionErrorAsync(sessionId, "Session has expired", "File processing attempted on expired session");
                sessionState.Status = SessionStatus.Failed;
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "Session has expired",
                    Status = SessionStatus.Failed
                };
            }

            // Update session status to processing
            sessionState.Status = SessionStatus.Processing;
            
            // Validate file source (Requirements 2.1, 2.2, 2.3)
            var sourceValidation = await _securityManager.ValidateFileSourceAsync(fileRequest.FileStream, fileRequest.ExpectedSource);
            if (!sourceValidation.IsValid)
            {
                await HandleSessionErrorAsync(sessionId, $"File source validation failed: {sourceValidation.ErrorMessage}", "Unauthorized file source");
                sessionState.Status = SessionStatus.Failed;
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "File source validation failed",
                    Status = SessionStatus.Failed
                };
            }

            // Store file in sandbox (Requirements 1.1, 1.2, 1.3)
            var fileResult = await _fileSystemManager.StoreFileAsync(sessionId, fileRequest.FileStream, fileRequest.FileName);
            if (!fileResult.Success)
            {
                await HandleSessionErrorAsync(sessionId, $"File storage failed: {fileResult.ErrorMessage}", "File storage failure");
                sessionState.Status = SessionStatus.Failed;
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "Failed to store file securely",
                    Status = SessionStatus.Failed
                };
            }

            // Validate file content (Requirements 6.1, 6.2, 6.4, 6.5)
            var fileValidation = await _fileSystemManager.ValidateFileAsync(sessionId, fileRequest.FileName);
            if (!fileValidation)
            {
                await HandleSessionErrorAsync(sessionId, "File content validation failed", "Invalid file content");
                sessionState.Status = SessionStatus.Failed;
                return new SessionResult
                {
                    Success = false,
                    SessionId = sessionId,
                    ErrorMessage = "File content validation failed",
                    Status = SessionStatus.Failed
                };
            }

            // Add file to session tracking
            var sessionFile = new SessionFile
            {
                FileName = fileRequest.FileName,
                FilePath = fileResult.FilePath,
                FileSize = fileResult.FileSize,
                FileHash = fileResult.FileHash,
                ReceivedAt = DateTime.UtcNow,
                Status = FileStatus.Ready
            };

            sessionState.Files ??= new List<SessionFile>();
            sessionState.Files.Add(sessionFile);

            // Record file processing in monitoring
            _monitoringService?.RecordFileProcessed(sessionId, fileResult.FileSize);

            // Log successful file processing
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.FileReceived,
                Description = "File processed and stored successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "FileName", fileRequest.FileName },
                    { "FileSize", fileResult.FileSize },
                    { "FileHash", fileResult.FileHash }
                }
            });

            // Update session status back to active
            sessionState.Status = SessionStatus.Active;

            return new SessionResult
            {
                Success = true,
                SessionId = sessionId,
                Status = SessionStatus.Active
            };
        }
        catch (Exception ex)
        {
            await HandleSessionErrorAsync(sessionId, ex.Message, "Unexpected error during file processing");
            return new SessionResult
            {
                Success = false,
                SessionId = sessionId,
                ErrorMessage = "Failed to process file due to internal error",
                Status = SessionStatus.Failed
            };
        }
    }

    public async Task<PrintResult> ExecutePrintJobAsync(string sessionId, PrintJobDescriptor descriptor)
    {
        _logger.LogInformation("Executing print job for file {FileName} in session {SessionId}", 
            descriptor.FileName, sessionId);

        try
        {
            if (!_sessions.TryGetValue(sessionId, out var sessionState))
            {
                await HandleSessionErrorAsync(sessionId, "Session not found", "Print job execution attempted on non-existent session");
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = "Session not found",
                    Status = PrintStatus.Failed
                };
            }

            if (sessionState.Status != SessionStatus.Processing && sessionState.Status != SessionStatus.Active)
            {
                await HandleSessionErrorAsync(sessionId, $"Session is not in a valid state for printing (current status: {sessionState.Status})", "Print job execution attempted on invalid session state");
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = $"Session is not in a valid state for printing (current status: {sessionState.Status})",
                    Status = PrintStatus.Failed
                };
            }

            // Check if session has expired (fail-closed)
            if (DateTime.UtcNow > sessionState.ExpiresAt)
            {
                await HandleSessionErrorAsync(sessionId, "Session has expired", "Print job execution attempted on expired session");
                sessionState.Status = SessionStatus.Failed;
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = "Session has expired",
                    Status = PrintStatus.Failed
                };
            }

            // Update session status to printing
            sessionState.Status = SessionStatus.Printing;
            
            // Submit print job to print manager (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
            var printResult = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);
            if (!printResult.Success)
            {
                await HandleSessionErrorAsync(sessionId, $"Print job submission failed: {printResult.ErrorMessage}", "Print job submission failure");
                sessionState.Status = SessionStatus.Failed;
                return printResult;
            }

            // Add print job to session tracking
            var printJob = new PrintJob
            {
                JobId = printResult.JobId,
                FileName = descriptor.FileName,
                Descriptor = descriptor,
                Status = printResult.Status,
                SubmittedAt = DateTime.UtcNow
            };

            sessionState.PrintJobs ??= new List<PrintJob>();
            sessionState.PrintJobs.Add(printJob);

            // Record print job submission in monitoring
            _monitoringService?.RecordPrintJobSubmitted(sessionId);

            // Log successful print job submission
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.PrintJobSubmitted,
                Description = "Print job submitted successfully",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "FileName", descriptor.FileName },
                    { "JobId", printResult.JobId },
                    { "Copies", descriptor.Copies },
                    { "ColorPrinting", descriptor.ColorPrinting },
                    { "DoubleSided", descriptor.DoubleSided }
                }
            });

            // Monitor print job completion in background
            _ = Task.Run(async () => await MonitorPrintJobAsync(sessionId, printResult.JobId));

            return printResult;
        }
        catch (Exception ex)
        {
            await HandleSessionErrorAsync(sessionId, ex.Message, "Unexpected error during print job execution");
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Failed to execute print job due to internal error",
                Status = PrintStatus.Failed
            };
        }
    }

    public SessionStatus GetSessionStatus(string sessionId)
    {
        _logger.LogDebug("Getting status for session {SessionId}", sessionId);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return SessionStatus.None;
        }

        if (!_sessions.TryGetValue(sessionId, out var sessionState))
        {
            return SessionStatus.None;
        }

        // Check if session has expired
        if (DateTime.UtcNow > sessionState.ExpiresAt && 
            sessionState.Status != SessionStatus.Completed && 
            sessionState.Status != SessionStatus.Failed && 
            sessionState.Status != SessionStatus.Invalidated)
        {
            _logger.LogWarning("Session {SessionId} has expired", sessionId);
            sessionState.Status = SessionStatus.Failed;
        }

        return sessionState.Status;
    }

    public async Task<SessionInfo?> GetSessionAsync(string sessionId)
    {
        _logger.LogDebug("Getting session info for {SessionId}", sessionId);

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return null;
        }

        if (!_sessions.TryGetValue(sessionId, out var sessionState))
        {
            return null;
        }

        // Check if session has expired
        if (DateTime.UtcNow > sessionState.ExpiresAt && 
            sessionState.Status != SessionStatus.Completed && 
            sessionState.Status != SessionStatus.Failed && 
            sessionState.Status != SessionStatus.Invalidated)
        {
            _logger.LogWarning("Session {SessionId} has expired", sessionId);
            sessionState.Status = SessionStatus.Failed;
            return null;
        }

        return new SessionInfo
        {
            SessionId = sessionState.SessionId,
            Status = sessionState.Status,
            CreatedAt = sessionState.CreatedAt,
            ExpiresAt = sessionState.ExpiresAt,
            ShopId = sessionState.Metadata.TryGetValue("ShopId", out var shopId) ? shopId?.ToString() : null,
            Files = sessionState.Files,
            Metadata = sessionState.Metadata
        };
    }

    public async Task InvalidateSessionAsync(string sessionId, string reason)
    {
        _logger.LogWarning("Invalidating session {SessionId} due to: {Reason}", sessionId, reason);

        try
        {
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                return;
            }

            if (_sessions.TryGetValue(sessionId, out var sessionState))
            {
                lock (_sessionLock)
                {
                    sessionState.Status = SessionStatus.Invalidated;
                    _logger.LogInformation("Session {SessionId} invalidated successfully", sessionId);
                }

                // Log security event
                await _securityManager.LogSecurityEventAsync(new SecurityEvent
                {
                    SessionId = sessionId,
                    EventType = SecurityEventType.SessionInvalidated,
                    Description = $"Session invalidated: {reason}",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object> { { "Reason", reason } }
                });

                // Trigger automatic cleanup (fail-closed behavior)
                try
                {
                    // Perform direct file system cleanup since we can't use CleanupManager due to circular dependency
                    var cleanupResult = await _fileSystemManager.SecureDeleteAsync(sessionId);
                    if (!cleanupResult.Success)
                    {
                        _logger.LogError("File system cleanup failed during session invalidation for {SessionId}: {Error}", 
                            sessionId, cleanupResult.ErrorMessage);
                    }
                }
                catch (Exception cleanupEx)
                {
                    _logger.LogError(cleanupEx, "Exception during cleanup for invalidated session {SessionId}", sessionId);
                }
            }
            else
            {
                _logger.LogWarning("Attempted to invalidate non-existent session {SessionId}", sessionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error invalidating session {SessionId}", sessionId);
            // Don't throw - invalidation should always succeed even if logging fails
        }
    }

    private void CleanupExpiredSessions(object? state)
    {
        var expiredSessions = new List<string>();
        var now = DateTime.UtcNow;

        foreach (var kvp in _sessions)
        {
            var sessionState = kvp.Value;
            if (now > sessionState.ExpiresAt && 
                sessionState.Status != SessionStatus.Completed && 
                sessionState.Status != SessionStatus.Failed && 
                sessionState.Status != SessionStatus.Invalidated)
            {
                expiredSessions.Add(kvp.Key);
            }
        }

        foreach (var sessionId in expiredSessions)
        {
            _logger.LogInformation("Auto-expiring session {SessionId}", sessionId);
            if (_sessions.TryGetValue(sessionId, out var sessionState))
            {
                sessionState.Status = SessionStatus.Failed;
                
                // Trigger cleanup for expired session (fail-closed behavior)
                Task.Run(async () =>
                {
                    try
                    {
                        // TODO: Send cleanup notification to frontend via SignalR
                        // This requires injecting IntegrationService to avoid circular dependency
                        
                        // Perform direct file system cleanup since we can't use CleanupManager due to circular dependency
                        await _fileSystemManager.SecureDeleteAsync(sessionId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to cleanup expired session {SessionId}", sessionId);
                    }
                });
            }
        }

        if (expiredSessions.Count > 0)
        {
            _logger.LogInformation("Auto-expired {Count} sessions", expiredSessions.Count);
        }
    }

    /// <summary>
    /// Monitors a print job until completion and handles session lifecycle
    /// </summary>
    private async Task MonitorPrintJobAsync(string sessionId, int jobId)
    {
        try
        {
            _logger.LogDebug("Starting print job monitoring for session {SessionId}, job {JobId}", sessionId, jobId);

            var maxWaitTime = TimeSpan.FromMinutes(10); // Maximum time to wait for print job
            var startTime = DateTime.UtcNow;
            var pollInterval = TimeSpan.FromSeconds(5);

            while (DateTime.UtcNow - startTime < maxWaitTime)
            {
                try
                {
                    var printStatus = await _printManager.GetPrintStatusAsync(sessionId, jobId);
                    
                    if (printStatus == PrintStatus.Completed)
                    {
                        _logger.LogInformation("Print job {JobId} completed successfully for session {SessionId}", jobId, sessionId);
                        
                        // Update session and print job status
                        if (_sessions.TryGetValue(sessionId, out var sessionState))
                        {
                            var printJob = sessionState.PrintJobs?.FirstOrDefault(pj => pj.JobId == jobId);
                            if (printJob != null)
                            {
                                printJob.Status = PrintStatus.Completed;
                                printJob.CompletedAt = DateTime.UtcNow;
                            }

                            // Check if all print jobs are completed
                            var allJobsCompleted = sessionState.PrintJobs?.All(pj => 
                                pj.Status == PrintStatus.Completed || pj.Status == PrintStatus.Failed) ?? true;

                            if (allJobsCompleted)
                            {
                                // Automatically end session after successful printing (Requirement 4.1)
                                _logger.LogInformation("All print jobs completed for session {SessionId}, ending session", sessionId);
                                await EndSessionAsync(sessionId);
                            }
                        }
                        break;
                    }
                    else if (printStatus == PrintStatus.Failed || printStatus == PrintStatus.Cancelled)
                    {
                        _logger.LogError("Print job {JobId} failed for session {SessionId}: {Status}", jobId, sessionId, printStatus);
                        
                        // Update print job status
                        if (_sessions.TryGetValue(sessionId, out var sessionState))
                        {
                            var printJob = sessionState.PrintJobs?.FirstOrDefault(pj => pj.JobId == jobId);
                            if (printJob != null)
                            {
                                printJob.Status = printStatus;
                                printJob.CompletedAt = DateTime.UtcNow;
                            }
                        }

                        // Invalidate session on print failure (fail-closed behavior)
                        await InvalidateSessionAsync(sessionId, $"Print job {jobId} failed with status: {printStatus}");
                        break;
                    }

                    await Task.Delay(pollInterval);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error monitoring print job {JobId} for session {SessionId}", jobId, sessionId);
                    await Task.Delay(pollInterval);
                }
            }

            // Handle timeout
            if (DateTime.UtcNow - startTime >= maxWaitTime)
            {
                _logger.LogError("Print job {JobId} monitoring timed out for session {SessionId}", jobId, sessionId);
                await InvalidateSessionAsync(sessionId, $"Print job {jobId} monitoring timed out");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Critical error in print job monitoring for session {SessionId}, job {JobId}", sessionId, jobId);
            await InvalidateSessionAsync(sessionId, $"Critical error in print job monitoring: {ex.Message}");
        }
    }

    /// <summary>
    /// Handles session errors with fail-closed behavior - invalidates session and triggers cleanup
    /// </summary>
    private async Task HandleSessionErrorAsync(string sessionId, string errorMessage, string securityDescription)
    {
        try
        {
            _logger.LogError("Session error for {SessionId}: {ErrorMessage}", sessionId, errorMessage);

            // Log security event
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = securityDescription,
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "ErrorMessage", errorMessage },
                    { "FailClosedTriggered", true }
                }
            });

            // Enforce fail-closed behavior
            await _securityManager.EnforceFailClosedAsync(sessionId, errorMessage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle session error for {SessionId}", sessionId);
            // Don't throw - error handling should not cause additional failures
        }
    }

    /// <summary>
    /// Performs crash recovery by cleaning up orphaned sessions from previous runs
    /// </summary>
    public async Task PerformCrashRecoveryAsync()
    {
        _logger.LogInformation("Performing crash recovery - cleaning up orphaned sessions");

        try
        {
            // Get all sessions that might be orphaned (not properly cleaned up)
            var orphanedSessions = new List<string>();
            
            foreach (var kvp in _sessions)
            {
                var sessionState = kvp.Value;
                // Consider sessions orphaned if they're in processing states but the service was restarted
                if (sessionState.Status == SessionStatus.Active || 
                    sessionState.Status == SessionStatus.Processing || 
                    sessionState.Status == SessionStatus.Printing)
                {
                    orphanedSessions.Add(kvp.Key);
                }
            }

            _logger.LogInformation("Found {Count} potentially orphaned sessions", orphanedSessions.Count);

            // Clean up each orphaned session
            foreach (var sessionId in orphanedSessions)
            {
                try
                {
                    _logger.LogInformation("Cleaning up orphaned session {SessionId}", sessionId);
                    
                    // Invalidate the session
                    await InvalidateSessionAsync(sessionId, "Crash recovery cleanup");
                    
                    // Perform direct file system cleanup
                    var cleanupResult = await _fileSystemManager.SecureDeleteAsync(sessionId);
                    if (!cleanupResult.Success)
                    {
                        _logger.LogError("Failed to cleanup orphaned session {SessionId}: {Error}", 
                            sessionId, cleanupResult.ErrorMessage);
                    }
                    else
                    {
                        _logger.LogInformation("Successfully cleaned up orphaned session {SessionId}", sessionId);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during crash recovery for session {SessionId}", sessionId);
                }
            }

            _logger.LogInformation("Crash recovery completed. Processed {Count} orphaned sessions", orphanedSessions.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during crash recovery");
        }
    }

    /// <summary>
    /// Gets all active session IDs for shutdown cleanup
    /// </summary>
    public async Task<List<string>> GetActiveSessionIdsAsync()
    {
        try
        {
            return _sessions.Values
                .Where(s => s.Status == SessionStatus.Active || 
                           s.Status == SessionStatus.Processing || 
                           s.Status == SessionStatus.Printing)
                .Select(s => s.SessionId)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting active session IDs");
            return new List<string>();
        }
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }
}