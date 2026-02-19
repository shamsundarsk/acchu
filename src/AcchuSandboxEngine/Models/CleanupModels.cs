namespace AcchuSandboxEngine.Models;

public class CleanupResult
{
    public bool Success { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public List<string> CleanedItems { get; set; } = new();
    public List<string> FailedItems { get; set; } = new();
    public int OverwritePasses { get; set; }
}