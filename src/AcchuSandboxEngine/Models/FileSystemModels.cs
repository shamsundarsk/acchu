using System.Security.Principal;

namespace AcchuSandboxEngine.Models;

public class SandboxResult
{
    public bool Success { get; set; }
    public string SandboxPath { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public SecurityIdentifier? ServiceSid { get; set; }
}

public class FileResult
{
    public bool Success { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string FileHash { get; set; } = string.Empty;
}

public class SessionFile
{
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string FileHash { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    public FileStatus Status { get; set; }
}

public enum FileStatus
{
    Received,
    Validated,
    Ready,
    Printing,
    Printed,
    Deleted
}