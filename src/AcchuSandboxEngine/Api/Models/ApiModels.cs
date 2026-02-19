using System.ComponentModel.DataAnnotations;

namespace AcchuSandboxEngine.Api.Models;

/// <summary>
/// Request model for starting a new session
/// </summary>
public class StartSessionRequest
{
    [Required]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    public string SessionToken { get; set; } = string.Empty;

    [Required]
    public DateTime ExpirationTime { get; set; }

    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// Response model for session operations
/// </summary>
public class SessionResponse
{
    public bool Success { get; set; }
    public string? SessionId { get; set; }
    public string? ErrorMessage { get; set; }
    public string? Status { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

/// <summary>
/// Request model for file upload
/// </summary>
public class FileUploadRequest
{
    [Required]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    public string FileName { get; set; } = string.Empty;

    [Required]
    public string PrintJobDescriptor { get; set; } = string.Empty; // JSON string

    public Dictionary<string, object>? Metadata { get; set; }
}

/// <summary>
/// File request model for internal use
/// </summary>
public class FileRequest
{
    public string FileName { get; set; } = string.Empty;
    public Stream? FileStream { get; set; }
    public AcchuSandboxEngine.Models.PrintJobDescriptor? PrintJobDescriptor { get; set; }
    public Dictionary<string, object> Metadata { get; set; } = new();
}

/// <summary>
/// Response model for file operations
/// </summary>
public class FileResponse
{
    public bool Success { get; set; }
    public string? FileName { get; set; }
    public string? FilePath { get; set; }
    public long FileSize { get; set; }
    public string? FileHash { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Request model for print job execution
/// </summary>
public class PrintJobRequest
{
    [Required]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    public string FileName { get; set; } = string.Empty;

    [Required]
    public string PrintJobDescriptor { get; set; } = string.Empty; // JSON string
}

/// <summary>
/// Response model for print operations
/// </summary>
public class PrintResponse
{
    public bool Success { get; set; }
    public int JobId { get; set; }
    public string? Status { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime? SubmittedAt { get; set; }
}

/// <summary>
/// Response model for session status queries
/// </summary>
public class SessionStatusResponse
{
    public string? SessionId { get; set; }
    public string? Status { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public List<FileInfo>? Files { get; set; }
    public List<PrintJobInfo>? PrintJobs { get; set; }
}

/// <summary>
/// File information for status responses
/// </summary>
public class FileInfo
{
    public string? FileName { get; set; }
    public long FileSize { get; set; }
    public string? Status { get; set; }
    public DateTime? ReceivedAt { get; set; }
}

/// <summary>
/// Print job information for status responses
/// </summary>
public class PrintJobInfo
{
    public int JobId { get; set; }
    public string? FileName { get; set; }
    public string? Status { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>
/// Standard API error response
/// </summary>
public class ApiErrorResponse
{
    public string? Error { get; set; }
    public string? Message { get; set; }
    public string? Details { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? RequestId { get; set; }
}

/// <summary>
/// Generic API response wrapper
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Health check response
/// </summary>
public class HealthResponse
{
    public string? Status { get; set; }
    public Dictionary<string, object>? Details { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Security event for API responses
/// </summary>
public class SecurityEvent
{
    public string? EventId { get; set; }
    public SecurityEventType EventType { get; set; }
    public string? Message { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Dictionary<string, object>? Details { get; set; }
}

/// <summary>
/// Security event types
/// </summary>
public enum SecurityEventType
{
    SessionCreated,
    SessionInvalidated,
    FileReceived,
    FileRejected,
    PrintJobSubmitted,
    SecurityViolation,
    CleanupCompleted,
    SystemError
}