using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Interfaces;

public interface ISessionManager : IDisposable
{
    Task<SessionResult> StartSessionAsync(SessionRequest request);
    Task<SessionResult> EndSessionAsync(string sessionId);
    Task<SessionResult> ProcessFileAsync(string sessionId, FileRequest fileRequest);
    Task<PrintResult> ExecutePrintJobAsync(string sessionId, PrintJobDescriptor descriptor);
    SessionStatus GetSessionStatus(string sessionId);
    Task InvalidateSessionAsync(string sessionId, string reason);
    Task<SessionInfo?> GetSessionAsync(string sessionId);
    
    // Error handling and crash recovery methods
    Task PerformCrashRecoveryAsync();
    Task<List<string>> GetActiveSessionIdsAsync();
}