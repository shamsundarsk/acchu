namespace AcchuSandboxEngine.Models;

public class PrintJobDescriptor
{
    public string SessionId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int Copies { get; set; }
    public bool ColorPrinting { get; set; }
    public bool IsColor { get; set; }
    public bool DoubleSided { get; set; }
    public bool Duplex { get; set; }
    public string PrinterName { get; set; } = string.Empty;
    public PrintQuality Quality { get; set; } = PrintQuality.Standard;
    public PaperSize PaperSize { get; set; } = PaperSize.A4;
    public string? PageRange { get; set; }
    public Dictionary<string, object> PrintSettings { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum PrintQuality
{
    Draft,
    Standard,
    High
}

public enum PaperSize
{
    A4,
    A3,
    Letter,
    Legal
}

public class PrintResult
{
    public bool Success { get; set; }
    public int JobId { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public PrintStatus Status { get; set; }
}

public enum PrintStatus
{
    Queued,
    Printing,
    Completed,
    Failed,
    Cancelled
}

public class PrintStatusInfo
{
    public PrintStatus Status { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class PrintJob
{
    public int JobId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public PrintJobDescriptor Descriptor { get; set; } = new();
    public PrintStatus Status { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime CompletedAt { get; set; }
}

/// <summary>
/// Print job information for mobile UI integration
/// </summary>
public class PrintJobInfo
{
    public int JobId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public PrintStatus Status { get; set; }
    public int Progress { get; set; } = 0; // 0-100
    public string? ErrorMessage { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}