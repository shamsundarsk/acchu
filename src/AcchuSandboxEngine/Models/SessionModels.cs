using System.Security.Principal;

namespace AcchuSandboxEngine.Models;

public class SessionRequest
{
    public string SessionId { get; set; } = string.Empty;
    public string SessionToken { get; set; } = string.Empty;
    public DateTime ExpirationTime { get; set; }
    public Dictionary<string, object> Metadata { get; set; } = new();
}

public class SessionResult
{
    public bool Success { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public SessionStatus Status { get; set; }
}

public enum SessionStatus
{
    None,
    Active,
    Processing,
    Printing,
    Completed,
    Failed,
    Invalidated
}

public class SessionState
{
    public string SessionId { get; set; } = string.Empty;
    public string SessionToken { get; set; } = string.Empty;
    public SessionStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string SandboxPath { get; set; } = string.Empty;
    public List<SessionFile> Files { get; set; } = new();
    public List<PrintJob> PrintJobs { get; set; } = new();
    public Dictionary<string, object> Metadata { get; set; } = new();
}

public class FileRequest
{
    public string FileName { get; set; } = string.Empty;
    public Stream FileStream { get; set; } = Stream.Null;
    public string ExpectedSource { get; set; } = string.Empty;
    public Dictionary<string, object> Metadata { get; set; } = new();
}

/// <summary>
/// Session information for integration endpoints
/// </summary>
public class SessionInfo
{
    public string SessionId { get; set; } = string.Empty;
    public SessionStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string? ShopId { get; set; }
    public List<SessionFile> Files { get; set; } = new();
    public Dictionary<string, object> Metadata { get; set; } = new();
    
    /// <summary>
    /// Indicates if the session is valid and active
    /// </summary>
    public bool IsValid => Status == SessionStatus.Active && DateTime.UtcNow < ExpiresAt;
}