namespace AcchuSandboxEngine.Models;

public class ValidationResult
{
    public bool IsValid { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public DateTime ValidUntil { get; set; }
    public Dictionary<string, object> Claims { get; set; } = new();
}

public class SecurityEvent
{
    public string SessionId { get; set; } = string.Empty;
    public SecurityEventType EventType { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public Dictionary<string, object> Details { get; set; } = new();
}

public enum SecurityEventType
{
    SessionStarted,
    SessionEnded,
    SessionValidated,
    FileReceived,
    PrintJobSubmitted,
    SecurityViolation,
    CleanupCompleted,
    SessionInvalidated,
    ActionRestrictionViolation,
    ParameterViolation
}

public class ActionRequest
{
    public string SessionId { get; set; } = string.Empty;
    public ActionType RequestedAction { get; set; }
    public Dictionary<string, object> Parameters { get; set; } = new();
    public string RequestSource { get; set; } = string.Empty;
    public DateTime RequestTime { get; set; } = DateTime.UtcNow;
}

public class ActionValidationResult
{
    public bool IsAllowed { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public ActionType AllowedAction { get; set; }
    public Dictionary<string, object> ValidatedParameters { get; set; } = new();
    public List<string> ViolationReasons { get; set; } = new();
}

public enum ActionType
{
    Print,
    Save,
    Copy,
    Export,
    Edit,
    Delete,
    Share,
    Email,
    Upload,
    Download,
    Preview,
    Unknown
}

public class ParameterViolation
{
    public string ParameterName { get; set; } = string.Empty;
    public object ExpectedValue { get; set; } = new();
    public object ActualValue { get; set; } = new();
    public string ViolationType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}