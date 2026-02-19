using System.ComponentModel.DataAnnotations;
using AcchuSandboxEngine.Interfaces;

namespace AcchuSandboxEngine.Api.Models;

// ============================================================================
// SHOPKEEPER WEB INTERFACE MODELS
// ============================================================================

/// <summary>
/// Request to generate QR code for shopkeeper
/// </summary>
public class ShopkeeperQrRequest
{
    [Required]
    public string ShopkeeperId { get; set; } = string.Empty;

    [Required]
    public string ShopName { get; set; } = string.Empty;

    public string? ShopAddress { get; set; }
    public string? ContactNumber { get; set; }
}

/// <summary>
/// Response with QR code data for shopkeeper
/// </summary>
public class ShopkeeperQrResponse
{
    public bool Success { get; set; }
    public string? SessionId { get; set; }
    public string? QrCodeData { get; set; } // JSON string that mobile will scan
    public string? QrCodeUrl { get; set; } // URL to QR code image
    public string? SandboxDownloadUrl { get; set; } // URL to download sandbox installer
    public DateTime ExpiresAt { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// QR code data structure (embedded in QR)
/// </summary>
public class QrCodeData
{
    public string SessionId { get; set; } = string.Empty;
    public string ShopkeeperId { get; set; } = string.Empty;
    public string ShopName { get; set; } = string.Empty;
    public string ApiEndpoint { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}

/// <summary>
/// Response with pending print jobs for shopkeeper
/// </summary>
public class ShopkeeperJobsResponse
{
    public bool Success { get; set; }
    public string? SessionId { get; set; }
    public List<PendingJob> PendingJobs { get; set; } = new();
    public int TotalJobs { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Pending print job information for shopkeeper UI
/// </summary>
public class PendingJob
{
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public DateTime ReceivedAt { get; set; }
    public PrintPreferences PrintPreferences { get; set; } = new();
    public decimal EstimatedCost { get; set; }
    public string Status { get; set; } = "Pending";
}

/// <summary>
/// Response when shopkeeper executes print
/// </summary>
public class ShopkeeperPrintResponse
{
    public bool Success { get; set; }
    public int JobId { get; set; }
    public string? FileName { get; set; }
    public string? Status { get; set; }
    public string? Message { get; set; }
    public DateTime PrintedAt { get; set; }
    public string? ErrorMessage { get; set; }
}

// ============================================================================
// CUSTOMER MOBILE INTERFACE MODELS
// ============================================================================

/// <summary>
/// Customer file upload request from mobile interface
/// </summary>
public class CustomerUploadRequest
{
    [Required]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    public string FileName { get; set; } = string.Empty;

    [Required]
    [Range(1, 10)]
    public int Copies { get; set; } = 1;

    public bool IsColor { get; set; } = false;

    public bool IsDuplex { get; set; } = false;

    // Additional metadata from mobile interface
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
}

/// <summary>
/// Response to customer upload
/// </summary>
public class CustomerUploadResponse
{
    public bool Success { get; set; }
    public string? SessionId { get; set; }
    public string? FileName { get; set; }
    public long FileSize { get; set; }
    public PrintPreferences PrintPreferences { get; set; } = new();
    public decimal EstimatedCost { get; set; }
    public string? Message { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Customer session status response
/// </summary>
public class CustomerStatusResponse
{
    public bool Success { get; set; }
    public string? SessionId { get; set; }
    public string? Status { get; set; } // Uploaded, Printing, Completed, Failed
    public string? Message { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime? LastUpdated { get; set; }
    public List<CustomerFile> Files { get; set; } = new();
}

/// <summary>
/// Customer file information
/// </summary>
public class CustomerFile
{
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string Status { get; set; } = string.Empty; // Uploaded, Printing, Printed, Failed
    public DateTime UploadedAt { get; set; }
    public DateTime? PrintedAt { get; set; }
    public PrintPreferences PrintPreferences { get; set; } = new();
    public decimal Cost { get; set; }
}

// ============================================================================
// SHARED INTEGRATION MODELS
// ============================================================================

/// <summary>
/// Real-time status update for WebSocket communication
/// </summary>
public class StatusUpdate
{
    public string SessionId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty; // FileUploaded, PrintStarted, PrintCompleted, SessionEnded
    public string? FileName { get; set; }
    public string? Status { get; set; }
    public string? Message { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Dictionary<string, object> Data { get; set; } = new();
}

/// <summary>
/// Configuration for integration endpoints
/// </summary>
public class IntegrationConfig
{
    public string ApiBaseUrl { get; set; } = string.Empty;
    public int SessionTimeoutMinutes { get; set; } = 60;
    public int MaxFileSize { get; set; } = 100 * 1024 * 1024; // 100MB
    public List<string> AllowedFileTypes { get; set; } = new() { ".pdf", ".doc", ".docx", ".jpg", ".png" };
    public PricingConfig Pricing { get; set; } = new();
}

/// <summary>
/// Pricing configuration for cost calculation
/// </summary>
public class PricingConfig
{
    public decimal BlackWhitePerPage { get; set; } = 2.0m;
    public decimal ColorPerPage { get; set; } = 6.0m;
    public decimal DuplexDiscount { get; set; } = 0.2m; // 20% discount for duplex
    public decimal ServiceFee { get; set; } = 1.0m;
}

// ============================================================================
// ERROR AND VALIDATION MODELS
// ============================================================================

/// <summary>
/// Validation result for integration requests
/// </summary>
public class IntegrationValidationResult
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
}

/// <summary>
/// Test token request for debugging
/// </summary>
public class TestTokenRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string ShopkeeperId { get; set; } = string.Empty;
}

/// <summary>
/// Integration-specific error response
/// </summary>
public class IntegrationErrorResponse : ApiErrorResponse
{
    public string? UserFriendlyMessage { get; set; }
    public string? SuggestedAction { get; set; }
    public bool IsRetryable { get; set; }
}

// ============================================================================
// MOBILE PRINT INTEGRATION MODELS
// ============================================================================

/// <summary>
/// Mobile print job submission request
/// </summary>
public class MobilePrintRequest
{
    [Required]
    public string SessionId { get; set; } = string.Empty;

    public string? PrinterName { get; set; }

    [Required]
    public List<MobilePrintFile> Files { get; set; } = new();
}

/// <summary>
/// Mobile print file configuration
/// </summary>
public class MobilePrintFile
{
    [Required]
    public string FileName { get; set; } = string.Empty;

    [Required]
    public string FilePath { get; set; } = string.Empty;

    [Range(1, 100)]
    public int Copies { get; set; } = 1;

    public bool IsColor { get; set; } = false;

    public bool IsDuplex { get; set; } = false;

    public string Quality { get; set; } = "standard"; // "standard" or "high"

    public string? PageRange { get; set; } // e.g., "1-5,8,10-12"
}

/// <summary>
/// Mobile print status response
/// </summary>
public class MobilePrintStatusResponse
{
    public bool Success { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public List<MobilePrintJobStatus> Jobs { get; set; } = new();
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Individual print job status for mobile UI
/// </summary>
public class MobilePrintJobStatus
{
    public int JobId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // Queued, Printing, Completed, Failed
    public int Progress { get; set; } = 0; // 0-100
    public string? ErrorMessage { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}