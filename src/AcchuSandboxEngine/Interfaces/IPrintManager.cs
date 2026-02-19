using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Interfaces;

public interface IPrintManager
{
    Task<PrintResult> SubmitPrintJobAsync(string sessionId, PrintJobDescriptor descriptor);
    Task<PrintJobResult> SubmitPrintJobAsync(PrintJobRequest request);
    Task<PrintStatus> GetPrintStatusAsync(string sessionId, int jobId);
    Task<bool> CancelPrintJobAsync(string sessionId, int jobId);
    Task<CleanupResult> ClearPrintSpoolerAsync(string sessionId);
    Task<List<PrintJobInfo>> GetSessionPrintJobsAsync(string sessionId);
}