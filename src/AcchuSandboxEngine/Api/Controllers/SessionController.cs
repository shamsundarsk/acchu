using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Api.Models;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using System.Text.Json;

namespace AcchuSandboxEngine.Api.Controllers;

/// <summary>
/// API controller for session management operations
/// Handles communication with ACCHU Backend for secure document processing
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SessionController : ControllerBase
{
    private readonly ILogger<SessionController> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;

    public SessionController(
        ILogger<SessionController> logger,
        ISessionManager sessionManager,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _securityManager = securityManager;
    }

    /// <summary>
    /// Starts a new session for document processing
    /// Requirements: 8.1, 8.2, 8.5
    /// </summary>
    [HttpPost("start")]
    public async Task<ActionResult<SessionResponse>> StartSession([FromBody] StartSessionRequest request)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        
        try
        {
            _logger.LogInformation("Starting session {SessionId} (Request: {RequestId})", 
                request.SessionId, requestId);

            // Validate session token (Requirement 8.5)
            var tokenValidation = await _securityManager.ValidateSessionTokenAsync(request.SessionToken);
            if (!tokenValidation.IsValid)
            {
                _logger.LogWarning("Invalid session token for session {SessionId} (Request: {RequestId}): {Error}", 
                    request.SessionId, requestId, tokenValidation.ErrorMessage);

                await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
                {
                    SessionId = request.SessionId,
                    EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                    Description = "Invalid session token provided",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object>
                    {
                        { "RequestId", requestId },
                        { "Error", tokenValidation.ErrorMessage ?? "Unknown error" }
                    }
                });

                return Unauthorized(new ApiErrorResponse
                {
                    Error = "InvalidToken",
                    Message = "Session token validation failed",
                    RequestId = requestId
                });
            }

            // Create session request
            var sessionRequest = new SessionRequest
            {
                SessionId = request.SessionId,
                SessionToken = request.SessionToken,
                ExpirationTime = request.ExpirationTime,
                Metadata = request.Metadata ?? new Dictionary<string, object>()
            };

            // Start the session
            var result = await _sessionManager.StartSessionAsync(sessionRequest);

            if (result.Success)
            {
                _logger.LogInformation("Session {SessionId} started successfully (Request: {RequestId})", 
                    request.SessionId, requestId);

                return Ok(new SessionResponse
                {
                    Success = true,
                    SessionId = result.SessionId,
                    Status = result.Status.ToString(),
                    CreatedAt = DateTime.UtcNow,
                    ExpiresAt = request.ExpirationTime
                });
            }
            else
            {
                _logger.LogWarning("Failed to start session {SessionId} (Request: {RequestId}): {Error}", 
                    request.SessionId, requestId, result.ErrorMessage);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "SessionStartFailed",
                    Message = result.ErrorMessage ?? "Failed to start session",
                    RequestId = requestId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting session {SessionId} (Request: {RequestId})", 
                request.SessionId, requestId);

            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                SessionId = request.SessionId,
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Exception during session start",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RequestId", requestId },
                    { "ExceptionType", ex.GetType().Name },
                    { "ExceptionMessage", ex.Message }
                }
            });

            return StatusCode(500, new ApiErrorResponse
            {
                Error = "InternalError",
                Message = "An error occurred while starting the session",
                RequestId = requestId
            });
        }
    }

    /// <summary>
    /// Ends an active session and triggers cleanup
    /// Requirements: 4.1, 4.2
    /// </summary>
    [HttpPost("{sessionId}/end")]
    public async Task<ActionResult<SessionResponse>> EndSession(string sessionId)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];

        try
        {
            _logger.LogInformation("Ending session {SessionId} (Request: {RequestId})", 
                sessionId, requestId);

            var result = await _sessionManager.EndSessionAsync(sessionId);

            if (result.Success)
            {
                _logger.LogInformation("Session {SessionId} ended successfully (Request: {RequestId})", 
                    sessionId, requestId);

                return Ok(new SessionResponse
                {
                    Success = true,
                    SessionId = result.SessionId,
                    Status = result.Status.ToString()
                });
            }
            else
            {
                _logger.LogWarning("Failed to end session {SessionId} (Request: {RequestId}): {Error}", 
                    sessionId, requestId, result.ErrorMessage);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "SessionEndFailed",
                    Message = result.ErrorMessage ?? "Failed to end session",
                    RequestId = requestId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ending session {SessionId} (Request: {RequestId})", 
                sessionId, requestId);

            return StatusCode(500, new ApiErrorResponse
            {
                Error = "InternalError",
                Message = "An error occurred while ending the session",
                RequestId = requestId
            });
        }
    }

    /// <summary>
    /// Uploads a file to the session sandbox
    /// Requirements: 2.1, 2.2, 2.3
    /// </summary>
    [HttpPost("{sessionId}/files")]
    [RequestSizeLimit(104857600)] // 100MB limit
    public async Task<ActionResult<FileResponse>> UploadFile(string sessionId, [FromForm] FileUploadRequest request, IFormFile file)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];

        try
        {
            _logger.LogInformation("Uploading file {FileName} to session {SessionId} (Request: {RequestId})", 
                request.FileName, sessionId, requestId);

            // Validate session ID matches
            if (request.SessionId != sessionId)
            {
                return BadRequest(new ApiErrorResponse
                {
                    Error = "SessionIdMismatch",
                    Message = "Session ID in request body does not match URL parameter",
                    RequestId = requestId
                });
            }

            // Validate file is provided
            if (file == null || file.Length == 0)
            {
                return BadRequest(new ApiErrorResponse
                {
                    Error = "NoFileProvided",
                    Message = "No file was provided in the request",
                    RequestId = requestId
                });
            }

            // Validate file source (Requirement 2.1)
            using var fileStream = file.OpenReadStream();
            var sourceValidation = await _securityManager.ValidateFileSourceAsync(fileStream, "ACCHU-Backend");
            if (!sourceValidation.IsValid)
            {
                _logger.LogWarning("Invalid file source for session {SessionId} (Request: {RequestId}): {Error}", 
                    sessionId, requestId, sourceValidation.ErrorMessage);

                await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
                {
                    SessionId = sessionId,
                    EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                    Description = "Invalid file source detected",
                    Timestamp = DateTime.UtcNow,
                    Details = new Dictionary<string, object>
                    {
                        { "RequestId", requestId },
                        { "FileName", request.FileName },
                        { "Error", sourceValidation.ErrorMessage ?? "Unknown error" }
                    }
                });

                return Unauthorized(new ApiErrorResponse
                {
                    Error = "InvalidFileSource",
                    Message = "File source validation failed",
                    RequestId = requestId
                });
            }

            // Parse print job descriptor (Requirement 2.3)
            PrintJobDescriptor? printJobDescriptor;
            try
            {
                printJobDescriptor = JsonSerializer.Deserialize<PrintJobDescriptor>(request.PrintJobDescriptor);
                if (printJobDescriptor == null)
                {
                    throw new JsonException("Deserialized to null");
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning("Invalid print job descriptor for session {SessionId} (Request: {RequestId}): {Error}", 
                    sessionId, requestId, ex.Message);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "InvalidPrintJobDescriptor",
                    Message = "Print job descriptor is not valid JSON",
                    Details = ex.Message,
                    RequestId = requestId
                });
            }

            // Reset file stream position
            fileStream.Position = 0;

            // Create file request for the session manager (convert from API model to core model)
            var coreFileRequest = new AcchuSandboxEngine.Models.FileRequest
            {
                FileName = request.FileName,
                FileStream = fileStream,
                ExpectedSource = "ACCHU Backend", // Set appropriate source
                Metadata = request.Metadata ?? new Dictionary<string, object>()
            };

            // Process the file
            var result = await _sessionManager.ProcessFileAsync(sessionId, coreFileRequest);

            if (result.Success)
            {
                _logger.LogInformation("File {FileName} uploaded successfully to session {SessionId} (Request: {RequestId})", 
                    request.FileName, sessionId, requestId);

                return Ok(new FileResponse
                {
                    Success = true,
                    FileName = request.FileName,
                    FileSize = file.Length
                });
            }
            else
            {
                _logger.LogWarning("Failed to upload file {FileName} to session {SessionId} (Request: {RequestId}): {Error}", 
                    request.FileName, sessionId, requestId, result.ErrorMessage);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "FileUploadFailed",
                    Message = result.ErrorMessage ?? "Failed to upload file",
                    RequestId = requestId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading file {FileName} to session {SessionId} (Request: {RequestId})", 
                request.FileName, sessionId, requestId);

            await _securityManager.LogSecurityEventAsync(new AcchuSandboxEngine.Models.SecurityEvent
            {
                SessionId = sessionId,
                EventType = AcchuSandboxEngine.Models.SecurityEventType.SecurityViolation,
                Description = "Exception during file upload",
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object>
                {
                    { "RequestId", requestId },
                    { "FileName", request.FileName },
                    { "ExceptionType", ex.GetType().Name },
                    { "ExceptionMessage", ex.Message }
                }
            });

            return StatusCode(500, new ApiErrorResponse
            {
                Error = "InternalError",
                Message = "An error occurred while uploading the file",
                RequestId = requestId
            });
        }
    }

    /// <summary>
    /// Executes a print job for a file in the session
    /// Requirements: 3.1, 3.2, 3.3, 3.4
    /// </summary>
    [HttpPost("{sessionId}/print")]
    public async Task<ActionResult<PrintResponse>> ExecutePrintJob(string sessionId, [FromBody] AcchuSandboxEngine.Api.Models.PrintJobRequest request)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];

        try
        {
            _logger.LogInformation("Executing print job for file {FileName} in session {SessionId} (Request: {RequestId})", 
                request.FileName, sessionId, requestId);

            // Validate session ID matches
            if (request.SessionId != sessionId)
            {
                return BadRequest(new ApiErrorResponse
                {
                    Error = "SessionIdMismatch",
                    Message = "Session ID in request body does not match URL parameter",
                    RequestId = requestId
                });
            }

            // Parse print job descriptor
            PrintJobDescriptor? printJobDescriptor;
            try
            {
                printJobDescriptor = JsonSerializer.Deserialize<PrintJobDescriptor>(request.PrintJobDescriptor);
                if (printJobDescriptor == null)
                {
                    throw new JsonException("Deserialized to null");
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning("Invalid print job descriptor for session {SessionId} (Request: {RequestId}): {Error}", 
                    sessionId, requestId, ex.Message);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "InvalidPrintJobDescriptor",
                    Message = "Print job descriptor is not valid JSON",
                    Details = ex.Message,
                    RequestId = requestId
                });
            }

            // Execute the print job
            var result = await _sessionManager.ExecutePrintJobAsync(sessionId, printJobDescriptor);

            if (result.Success)
            {
                _logger.LogInformation("Print job executed successfully for file {FileName} in session {SessionId} (Request: {RequestId})", 
                    request.FileName, sessionId, requestId);

                return Ok(new PrintResponse
                {
                    Success = true,
                    JobId = result.JobId,
                    Status = result.Status.ToString(),
                    SubmittedAt = DateTime.UtcNow
                });
            }
            else
            {
                _logger.LogWarning("Failed to execute print job for file {FileName} in session {SessionId} (Request: {RequestId}): {Error}", 
                    request.FileName, sessionId, requestId, result.ErrorMessage);

                return BadRequest(new ApiErrorResponse
                {
                    Error = "PrintJobFailed",
                    Message = result.ErrorMessage ?? "Failed to execute print job",
                    RequestId = requestId
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing print job for file {FileName} in session {SessionId} (Request: {RequestId})", 
                request.FileName, sessionId, requestId);

            return StatusCode(500, new ApiErrorResponse
            {
                Error = "InternalError",
                Message = "An error occurred while executing the print job",
                RequestId = requestId
            });
        }
    }

    /// <summary>
    /// Gets the status of a session
    /// Requirements: 8.3, 8.4
    /// </summary>
    [HttpGet("{sessionId}/status")]
    public async Task<ActionResult<SessionStatusResponse>> GetSessionStatus(string sessionId)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];

        try
        {
            _logger.LogDebug("Getting status for session {SessionId} (Request: {RequestId})", 
                sessionId, requestId);

            var status = _sessionManager.GetSessionStatus(sessionId);

            if (status == SessionStatus.None)
            {
                return NotFound(new ApiErrorResponse
                {
                    Error = "SessionNotFound",
                    Message = "Session not found",
                    RequestId = requestId
                });
            }

            // Get detailed session information if available
            var response = new SessionStatusResponse
            {
                SessionId = sessionId,
                Status = status.ToString()
            };

            // Add more details if session manager supports it
            // Note: Extended session details would require additional implementation
            // For now, we return basic status information

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting status for session {SessionId} (Request: {RequestId})", 
                sessionId, requestId);

            return StatusCode(500, new ApiErrorResponse
            {
                Error = "InternalError",
                Message = "An error occurred while getting session status",
                RequestId = requestId
            });
        }
    }
}