using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Interfaces;

public interface ICleanupManager
{
    Task<CleanupResult> PerformFullCleanupAsync(string sessionId);
    Task<CleanupResult> SecureDeleteFilesAsync(string sandboxPath);
    Task<CleanupResult> ClearPrintSpoolerAsync(string sessionId);
    Task<CleanupResult> ClearTemporaryCachesAsync(string sessionId);
    Task<bool> VerifyNoDataResidueAsync(string sessionId);
}