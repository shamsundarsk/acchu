using AcchuSandboxEngine.Interfaces;

namespace AcchuSandboxEngine.Api.Models;

// New models for file upload and management
public class CustomerFileUploadRequest
{
    public string SessionId { get; set; } = string.Empty;
    public IFormFileCollection Files { get; set; } = null!;
    public int Copies { get; set; } = 1;
    public string ColorMode { get; set; } = "bw"; // "bw" or "color"
    public string Quality { get; set; } = "standard"; // "standard" or "high"
    public string Pages { get; set; } = "all"; // "all" or "custom"
    public string? CustomRange { get; set; }
}

public class UploadedFileInfo
{
    public string FileId { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string GeneratedName { get; set; } = string.Empty;
    public long Size { get; set; }
    public PrintPreferences PrintPreferences { get; set; } = new();
}

public class FileUploadResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<UploadedFileInfo> UploadedFiles { get; set; } = new();
    public string Message { get; set; } = string.Empty;
}

public class ShopkeeperFileInfo
{
    public string FileId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long Size { get; set; }
    public PrintPreferences PrintPreferences { get; set; } = new();
    public DateTime UploadedAt { get; set; }
    public decimal EstimatedCost { get; set; }
}

public class ShopkeeperFilesResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<ShopkeeperFileInfo> Files { get; set; } = new();
    public int TotalFiles { get; set; }
    public decimal TotalEstimatedCost { get; set; }
}

public class PrintExecutionResponse
{
    public string JobId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime EstimatedCompletionTime { get; set; }
}