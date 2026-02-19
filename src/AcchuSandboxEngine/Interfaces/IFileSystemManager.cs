using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Interfaces;

public class FileStoreResult
{
    public bool Success { get; set; }
    public string? FileId { get; set; }
    public string? ErrorMessage { get; set; }
}

public class SessionFileInfo
{
    public string FileId { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string? GeneratedName { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public long Size { get; set; }
    public PrintPreferences? PrintPreferences { get; set; }
    public DateTime UploadedAt { get; set; }
}

public class PrintPreferences
{
    public int Copies { get; set; } = 1;
    public string ColorMode { get; set; } = "bw";
    public string Quality { get; set; } = "standard";
    public string Pages { get; set; } = "all";
    public string? CustomRange { get; set; }
}

public class FileMetadata
{
    public string OriginalName { get; set; } = string.Empty;
    public long Size { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public PrintPreferences PrintPreferences { get; set; } = new();
}

public class PrintJobRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string FileId { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public PrintJobOptions PrintOptions { get; set; } = new();
}

public class PrintJobOptions
{
    public int Copies { get; set; } = 1;
    public string ColorMode { get; set; } = "bw";
    public string Quality { get; set; } = "standard";
}

public class PrintJobResult
{
    public bool Success { get; set; }
    public string? JobId { get; set; }
    public string? ErrorMessage { get; set; }
}

public interface IFileSystemManager
{
    Task<SandboxResult> CreateSandboxAsync(string sessionId);
    Task<FileResult> StoreFileAsync(string sessionId, Stream fileStream, string fileName);
    Task<bool> ValidateFileAsync(string sessionId, string fileName);
    Task<FileStoreResult> StoreFileAsync(string sessionId, Stream fileStream, string fileName, FileMetadata metadata);
    Task<List<SessionFileInfo>> GetSessionFilesAsync(string sessionId);
    Task<SessionFileInfo?> GetFileInfoAsync(string sessionId, string fileId);
    Task<CleanupResult> SecureDeleteAsync(string sessionId);
    Task<bool> VerifyCleanupAsync(string sessionId);
}