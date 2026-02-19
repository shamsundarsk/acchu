namespace AcchuSandboxEngine.Configuration;

public class SandboxConfiguration
{
    public const string SectionName = "Sandbox";
    
    public string TempDirectoryRoot { get; set; } = Path.GetTempPath();
    public int MaxSessionDurationMinutes { get; set; } = 60;
    public int MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024; // 100MB
    public List<string> AllowedFileTypes { get; set; } = new() { ".pdf", ".doc", ".docx", ".txt", ".jpg", ".png" };
    public int SecureDeletionPasses { get; set; } = 3;
    public bool EnableAuditLogging { get; set; } = true;
    public string ServiceAccountName { get; set; } = "NT AUTHORITY\\LOCAL SERVICE";
}