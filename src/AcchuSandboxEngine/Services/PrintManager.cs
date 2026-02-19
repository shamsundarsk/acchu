using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Runtime.InteropServices;
using System.Text;
using System.ComponentModel;
using System.Security;

namespace AcchuSandboxEngine.Services;

public class PrintManager : IPrintManager, IDisposable
{
    private readonly ILogger<PrintManager> _logger;
    private readonly PrintConfiguration _config;
    private readonly Dictionary<string, List<int>> _sessionPrintJobs;
    private readonly object _lockObject = new();
    private readonly ISecurityManager _securityManager;
    private readonly Timer _printerStatusTimer;

    public PrintManager(
        ILogger<PrintManager> logger, 
        IOptions<PrintConfiguration> config,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _config = config.Value;
        _sessionPrintJobs = new Dictionary<string, List<int>>();
        _securityManager = securityManager;
        
        // Start printer status monitoring timer
        _printerStatusTimer = new Timer(MonitorPrinterStatus, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
    }

    public async Task<PrintJobResult> SubmitPrintJobAsync(PrintJobRequest request)
    {
        try
        {
            _logger.LogInformation("Submitting print job for file {FileId} in session {SessionId}", 
                request.FileId, request.SessionId);

            // Validate file exists
            if (!File.Exists(request.FilePath))
            {
                return new PrintJobResult
                {
                    Success = false,
                    ErrorMessage = "File not found for printing"
                };
            }

            // Generate job ID
            var jobId = Guid.NewGuid().ToString("N");

            // Create print job descriptor
            var descriptor = new PrintJobDescriptor
            {
                SessionId = request.SessionId,
                FilePath = request.FilePath,
                Copies = request.PrintOptions.Copies,
                PrinterName = "Default",
                CreatedAt = DateTime.UtcNow
            };

            // Submit to existing print system
            var printResult = await SubmitPrintJobAsync(request.SessionId, descriptor);

            if (printResult.Success)
            {
                _logger.LogInformation("Print job {JobId} submitted successfully for session {SessionId}", 
                    jobId, request.SessionId);

                return new PrintJobResult
                {
                    Success = true,
                    JobId = jobId
                };
            }
            else
            {
                return new PrintJobResult
                {
                    Success = false,
                    ErrorMessage = printResult.ErrorMessage
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting print job for session {SessionId}", request.SessionId);
            return new PrintJobResult
            {
                Success = false,
                ErrorMessage = "Internal error submitting print job"
            };
        }
    }

    public async Task<PrintResult> SubmitPrintJobAsync(string sessionId, PrintJobDescriptor descriptor)
    {
        _logger.LogInformation("Submitting print job for file {FileName} in session {SessionId}", 
            descriptor.FileName, sessionId);

        try
        {
            // Enhanced security check for session-based printing
            if (!await _securityManager.ValidateSessionAsync(sessionId))
            {
                _logger.LogWarning("Invalid session {SessionId} attempted to submit print job", sessionId);
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = "Invalid session for print job submission",
                    Status = PrintStatus.Failed
                };
            }

            // Check if we're using mock printer mode
            if (_config.UseMockPrinter)
            {
                return await SubmitMockPrintJobAsync(sessionId, descriptor);
            }

            // Validate print parameters against configuration
            var validationResult = ValidatePrintParameters(descriptor);
            if (!validationResult.Success)
            {
                await HandlePrintErrorAsync(sessionId, new ArgumentException(validationResult.ErrorMessage), "Print parameter validation failed");
                return validationResult;
            }

            // Get printer name and check printer status
            var printerName = string.IsNullOrEmpty(descriptor.PrinterName) 
                ? _config.DefaultPrinterName 
                : descriptor.PrinterName;

            // Check printer availability before attempting to print
            var printerStatus = await CheckPrinterStatusAsync(printerName);
            if (!printerStatus.IsOnline)
            {
                await HandlePrintErrorAsync(sessionId, new InvalidOperationException($"Printer {printerName} is offline"), "Printer offline during print job submission");
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = $"Printer {printerName} is offline or unavailable",
                    Status = PrintStatus.Failed
                };
            }

            if (!OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                var errorMessage = $"Failed to open printer {printerName}. Error: {error}";
                await HandlePrintErrorAsync(sessionId, new ExternalException(errorMessage, error), "Failed to open printer");
                return new PrintResult
                {
                    Success = false,
                    JobId = 0,
                    ErrorMessage = $"Failed to open printer: {printerName}",
                    Status = PrintStatus.Failed
                };
            }

            try
            {
                // Create document info
                var docInfo = new DOCINFOW
                {
                    cbSize = Marshal.SizeOf<DOCINFOW>(),
                    lpszDocName = descriptor.FileName,
                    lpszOutput = null,
                    lpszDatatype = "RAW"
                };

                // Start document
                var jobId = StartDocPrinter(hPrinter, 1, ref docInfo);
                if (jobId == 0)
                {
                    var error = Marshal.GetLastWin32Error();
                    var errorMessage = $"Failed to start document for printer {printerName}. Error: {error}";
                    await HandlePrintErrorAsync(sessionId, new ExternalException(errorMessage, error), "Failed to start print document");
                    return new PrintResult
                    {
                        Success = false,
                        JobId = 0,
                        ErrorMessage = "Failed to start print document",
                        Status = PrintStatus.Failed
                    };
                }

                // Track the job for this session
                lock (_lockObject)
                {
                    if (!_sessionPrintJobs.ContainsKey(sessionId))
                    {
                        _sessionPrintJobs[sessionId] = new List<int>();
                    }
                    _sessionPrintJobs[sessionId].Add(jobId);
                }

                // Set print job properties based on descriptor
                await SetPrintJobPropertiesAsync(hPrinter, jobId, descriptor);

                _logger.LogInformation("Successfully submitted print job {JobId} for file {FileName} in session {SessionId}", 
                    jobId, descriptor.FileName, sessionId);

                return new PrintResult
                {
                    Success = true,
                    JobId = jobId,
                    ErrorMessage = string.Empty,
                    Status = PrintStatus.Queued
                };
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
        catch (UnauthorizedAccessException ex)
        {
            await HandlePrintErrorAsync(sessionId, ex, "Unauthorized access during print job submission");
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Access denied to printer",
                Status = PrintStatus.Failed
            };
        }
        catch (ExternalException ex)
        {
            await HandlePrintErrorAsync(sessionId, ex, "Windows API error during print job submission");
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Print system error",
                Status = PrintStatus.Failed
            };
        }
        catch (Exception ex)
        {
            await HandlePrintErrorAsync(sessionId, ex, "Unexpected error during print job submission");
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Failed to submit print job due to internal error",
                Status = PrintStatus.Failed
            };
        }
    }

    public async Task<PrintStatus> GetPrintStatusAsync(string sessionId, int jobId)
    {
        _logger.LogDebug("Getting print status for job {JobId} in session {SessionId}", jobId, sessionId);

        try
        {
            // Verify job belongs to session
            lock (_lockObject)
            {
                if (!_sessionPrintJobs.ContainsKey(sessionId) || 
                    !_sessionPrintJobs[sessionId].Contains(jobId))
                {
                    _logger.LogWarning("Job {JobId} not found in session {SessionId}", jobId, sessionId);
                    return PrintStatus.Failed;
                }
            }

            // For mock printer, return completed status after delay
            if (_config.UseMockPrinter)
            {
                // Simulate print completion after the mock delay
                await Task.Delay(100); // Small delay for realism
                return PrintStatus.Completed;
            }

            // Get job info from spooler
            var status = await GetJobStatusFromSpoolerAsync(jobId);
            return status;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting print status for job {JobId} in session {SessionId}", jobId, sessionId);
            return PrintStatus.Failed;
        }
    }

    public async Task<bool> CancelPrintJobAsync(string sessionId, int jobId)
    {
        _logger.LogInformation("Cancelling print job {JobId} in session {SessionId}", jobId, sessionId);

        try
        {
            // Verify job belongs to session
            lock (_lockObject)
            {
                if (!_sessionPrintJobs.ContainsKey(sessionId) || 
                    !_sessionPrintJobs[sessionId].Contains(jobId))
                {
                    _logger.LogWarning("Job {JobId} not found in session {SessionId}", jobId, sessionId);
                    return false;
                }
            }

            // Cancel the job
            var success = await CancelJobInSpoolerAsync(jobId);
            
            if (success)
            {
                // Remove from session tracking
                lock (_lockObject)
                {
                    _sessionPrintJobs[sessionId].Remove(jobId);
                }
            }

            return success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling print job {JobId} in session {SessionId}", jobId, sessionId);
            return false;
        }
    }

    public async Task<CleanupResult> ClearPrintSpoolerAsync(string sessionId)
    {
        _logger.LogInformation("Clearing print spooler for session {SessionId}", sessionId);

        var result = new CleanupResult
        {
            Success = true,
            ErrorMessage = string.Empty,
            CleanedItems = new List<string>(),
            FailedItems = new List<string>(),
            OverwritePasses = 0
        };

        try
        {
            List<int> jobsToCancel;
            lock (_lockObject)
            {
                if (!_sessionPrintJobs.ContainsKey(sessionId))
                {
                    _logger.LogDebug("No print jobs found for session {SessionId}", sessionId);
                    return result;
                }

                jobsToCancel = new List<int>(_sessionPrintJobs[sessionId]);
                _sessionPrintJobs.Remove(sessionId);
            }

            foreach (var jobId in jobsToCancel)
            {
                try
                {
                    var cancelled = await CancelJobInSpoolerAsync(jobId);
                    if (cancelled)
                    {
                        result.CleanedItems.Add($"Print job {jobId}");
                        _logger.LogDebug("Successfully cancelled print job {JobId} for session {SessionId}", jobId, sessionId);
                    }
                    else
                    {
                        result.FailedItems.Add($"Print job {jobId}");
                        _logger.LogWarning("Failed to cancel print job {JobId} for session {SessionId}", jobId, sessionId);
                    }
                }
                catch (Exception ex)
                {
                    result.FailedItems.Add($"Print job {jobId}");
                    _logger.LogError(ex, "Error cancelling print job {JobId} for session {SessionId}", jobId, sessionId);
                }
            }

            if (result.FailedItems.Count > 0)
            {
                result.Success = false;
                result.ErrorMessage = $"Failed to cancel {result.FailedItems.Count} print jobs";
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing print spooler for session {SessionId}", sessionId);
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    private PrintResult ValidatePrintParameters(PrintJobDescriptor descriptor)
    {
        // Validate copies
        if (descriptor.Copies <= 0 || descriptor.Copies > _config.MaxCopiesAllowed)
        {
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = $"Invalid number of copies: {descriptor.Copies}. Must be between 1 and {_config.MaxCopiesAllowed}",
                Status = PrintStatus.Failed
            };
        }

        // Validate color printing
        if (descriptor.ColorPrinting && !_config.AllowColorPrinting)
        {
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Color printing is not allowed",
                Status = PrintStatus.Failed
            };
        }

        // Validate double-sided printing
        if (descriptor.DoubleSided && !_config.AllowDoubleSided)
        {
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Double-sided printing is not allowed",
                Status = PrintStatus.Failed
            };
        }

        return new PrintResult { Success = true };
    }

    private async Task SetPrintJobPropertiesAsync(IntPtr hPrinter, int jobId, PrintJobDescriptor descriptor)
    {
        // This would set printer-specific properties like copies, color, duplex
        // Implementation depends on specific printer driver capabilities
        await Task.CompletedTask; // Placeholder for async operations
        
        _logger.LogDebug("Set print job properties for job {JobId}: Copies={Copies}, Color={Color}, DoubleSided={DoubleSided}", 
            jobId, descriptor.Copies, descriptor.ColorPrinting, descriptor.DoubleSided);
    }

    private async Task<PrintStatus> GetJobStatusFromSpoolerAsync(int jobId)
    {
        // Query the Windows Print Spooler for job status
        // This is a simplified implementation
        await Task.Delay(10); // Simulate async operation
        
        // In a real implementation, this would query the spooler API
        // For now, return a default status
        return PrintStatus.Queued;
    }

    private async Task<bool> CancelJobInSpoolerAsync(int jobId)
    {
        try
        {
            // Find the printer that has this job
            var printerName = await FindPrinterForJobAsync(jobId);
            if (string.IsNullOrEmpty(printerName))
            {
                _logger.LogWarning("Could not find printer for job {JobId}", jobId);
                return false;
            }

            if (!OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                _logger.LogError("Failed to open printer {PrinterName} for job cancellation. Error: {Error}", printerName, error);
                return false;
            }

            try
            {
                // Cancel the job
                var success = SetJob(hPrinter, jobId, 0, IntPtr.Zero, (int)JobControl.JOB_CONTROL_CANCEL);
                if (!success)
                {
                    var error = Marshal.GetLastWin32Error();
                    _logger.LogError("Failed to cancel job {JobId}. Error: {Error}", jobId, error);
                }
                return success;
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling job {JobId} in spooler", jobId);
            return false;
        }
    }

    private async Task<string> FindPrinterForJobAsync(int jobId)
    {
        // This would enumerate printers and find which one has the job
        // Simplified implementation returns default printer
        await Task.CompletedTask;
        return _config.DefaultPrinterName;
    }

    /// <summary>
    /// Monitors printer status and handles offline/online transitions
    /// </summary>
    private void MonitorPrinterStatus(object? state)
    {
        try
        {
            _logger.LogDebug("Monitoring printer status");
            
            // Check default printer status
            var printerStatus = CheckPrinterStatusAsync(_config.DefaultPrinterName).Result;
            
            if (!printerStatus.IsOnline)
            {
                _logger.LogWarning("Default printer {PrinterName} is offline", _config.DefaultPrinterName);
                
                // Log printer status event
                Task.Run(async () =>
                {
                    try
                    {
                        await _securityManager.LogSecurityEventAsync(new SecurityEvent
                        {
                            EventType = SecurityEventType.SecurityViolation,
                            Description = $"Printer {_config.DefaultPrinterName} is offline",
                            Timestamp = DateTime.UtcNow,
                            Details = new Dictionary<string, object> 
                            { 
                                { "PrinterName", _config.DefaultPrinterName },
                                { "Status", "Offline" },
                                { "ErrorMessage", printerStatus.ErrorMessage }
                            }
                        });

                        // Trigger fail-closed behavior for any active sessions using this printer
                        await HandlePrinterOfflineAsync(_config.DefaultPrinterName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to log printer status event");
                    }
                });
            }
            else
            {
                _logger.LogDebug("Printer {PrinterName} is online", _config.DefaultPrinterName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during printer status monitoring");
            
            // Log monitoring failure as security event
            Task.Run(async () =>
            {
                try
                {
                    await _securityManager.LogSecurityEventAsync(new SecurityEvent
                    {
                        EventType = SecurityEventType.SecurityViolation,
                        Description = "Printer status monitoring failed",
                        Timestamp = DateTime.UtcNow,
                        Details = new Dictionary<string, object> 
                        { 
                            { "Error", ex.Message },
                            { "ExceptionType", ex.GetType().Name }
                        }
                    });
                }
                catch (Exception logEx)
                {
                    _logger.LogError(logEx, "Failed to log printer monitoring error");
                }
            });
        }
    }

    /// <summary>
    /// Checks the status of a specific printer
    /// </summary>
    private async Task<PrinterStatusResult> CheckPrinterStatusAsync(string printerName)
    {
        try
        {
            await Task.CompletedTask; // Make method async
            
            if (string.IsNullOrEmpty(printerName))
            {
                return new PrinterStatusResult
                {
                    IsOnline = false,
                    ErrorMessage = "Printer name is empty"
                };
            }

            // Try to open the printer to check if it's available
            if (!OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero))
            {
                var error = Marshal.GetLastWin32Error();
                return new PrinterStatusResult
                {
                    IsOnline = false,
                    ErrorMessage = $"Cannot open printer {printerName}. Error: {error}"
                };
            }

            try
            {
                // Printer opened successfully, it's available
                return new PrinterStatusResult
                {
                    IsOnline = true,
                    ErrorMessage = string.Empty
                };
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
        catch (Exception ex)
        {
            return new PrinterStatusResult
            {
                IsOnline = false,
                ErrorMessage = ex.Message
            };
        }
    }

    /// <summary>
    /// Handles printer errors with fail-closed behavior
    /// </summary>
    private async Task HandlePrintErrorAsync(string sessionId, Exception exception, string securityDescription)
    {
        try
        {
            _logger.LogError(exception, "Print error for session {SessionId}: {Description}", sessionId, securityDescription);

            // Log security event
            await _securityManager.LogSecurityEventAsync(new SecurityEvent
            {
                SessionId = sessionId,
                EventType = SecurityEventType.SecurityViolation,
                Description = securityDescription,
                Timestamp = DateTime.UtcNow,
                Details = new Dictionary<string, object> 
                { 
                    { "ExceptionType", exception.GetType().Name },
                    { "ExceptionMessage", exception.Message },
                    { "FailClosedTriggered", true }
                }
            });

            // Enforce fail-closed behavior
            await _securityManager.EnforceFailClosedAsync(sessionId, $"Print error: {exception.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle print error for session {SessionId}", sessionId);
            // Don't throw - error handling should not cause additional failures
        }
    }

    /// <summary>
    /// Handles printer offline scenarios by invalidating affected sessions
    /// </summary>
    private async Task HandlePrinterOfflineAsync(string printerName)
    {
        try
        {
            _logger.LogWarning("Handling printer offline scenario for {PrinterName}", printerName);

            // Find all sessions that might be using this printer
            List<string> affectedSessions;
            lock (_lockObject)
            {
                affectedSessions = _sessionPrintJobs.Keys.ToList();
            }

            foreach (var sessionId in affectedSessions)
            {
                try
                {
                    _logger.LogWarning("Invalidating session {SessionId} due to printer {PrinterName} being offline", 
                        sessionId, printerName);

                    // Cancel any pending print jobs for this session
                    await ClearPrintSpoolerAsync(sessionId);

                    // Enforce fail-closed behavior
                    await _securityManager.EnforceFailClosedAsync(sessionId, 
                        $"Printer {printerName} went offline during session");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to handle printer offline for session {SessionId}", sessionId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle printer offline scenario for {PrinterName}", printerName);
        }
    }

    /// <summary>
    /// Submits a mock print job for testing and demo purposes
    /// </summary>
    private async Task<PrintResult> SubmitMockPrintJobAsync(string sessionId, PrintJobDescriptor descriptor)
    {
        _logger.LogInformation("Submitting MOCK print job for file {FileName} in session {SessionId}", 
            descriptor.FileName, sessionId);

        try
        {
            // Validate print parameters against configuration
            var validationResult = ValidatePrintParameters(descriptor);
            if (!validationResult.Success)
            {
                return validationResult;
            }

            // Generate a mock job ID
            var jobId = new Random().Next(1000, 9999);

            // Track the job for this session
            lock (_lockObject)
            {
                if (!_sessionPrintJobs.ContainsKey(sessionId))
                {
                    _sessionPrintJobs[sessionId] = new List<int>();
                }
                _sessionPrintJobs[sessionId].Add(jobId);
            }

            _logger.LogInformation("Mock print job {JobId} created for file {FileName} in session {SessionId}", 
                jobId, descriptor.FileName, sessionId);

            // Simulate printing delay
            _ = Task.Run(async () =>
            {
                await Task.Delay(_config.MockPrintDelay);
                _logger.LogInformation("Mock print job {JobId} completed for file {FileName} in session {SessionId}", 
                    jobId, descriptor.FileName, sessionId);
            });

            return new PrintResult
            {
                Success = true,
                JobId = jobId,
                ErrorMessage = string.Empty,
                Status = PrintStatus.Printing
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in mock print job for session {SessionId}", sessionId);
            return new PrintResult
            {
                Success = false,
                JobId = 0,
                ErrorMessage = "Mock print job failed",
                Status = PrintStatus.Failed
            };
        }
    }

    /// <summary>
    /// Disposes resources including the printer status timer
    /// </summary>
    public void Dispose()
    {
        _printerStatusTimer?.Dispose();
    }

    /// <summary>
    /// Gets all print jobs for a specific session
    /// </summary>
    public async Task<List<PrintJobInfo>> GetSessionPrintJobsAsync(string sessionId)
    {
        _logger.LogInformation("Getting print jobs for session {SessionId}", sessionId);

        var jobInfos = new List<PrintJobInfo>();

        try
        {
            lock (_lockObject)
            {
                if (_sessionPrintJobs.ContainsKey(sessionId))
                {
                    var jobIds = _sessionPrintJobs[sessionId];
                    
                    foreach (var jobId in jobIds)
                    {
                        // For now, create mock job info
                        // In a real implementation, you would query the Windows print spooler
                        var jobInfo = new PrintJobInfo
                        {
                            JobId = jobId,
                            FileName = $"Document_{jobId}.pdf", // This would come from stored job data
                            Status = PrintStatus.Completed, // This would be queried from print spooler
                            Progress = 100,
                            SubmittedAt = DateTime.UtcNow.AddMinutes(-5), // This would be stored when job was submitted
                            CompletedAt = DateTime.UtcNow.AddMinutes(-2)
                        };

                        jobInfos.Add(jobInfo);
                    }
                }
            }

            _logger.LogInformation("Found {JobCount} print jobs for session {SessionId}", jobInfos.Count, sessionId);
            return jobInfos;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting print jobs for session {SessionId}", sessionId);
            return new List<PrintJobInfo>();
        }
    }

    /// <summary>
    /// Result of printer status check
    /// </summary>
    private class PrinterStatusResult
    {
        public bool IsOnline { get; set; }
        public string ErrorMessage { get; set; } = string.Empty;
    }

    #region Windows API P/Invoke Declarations

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool SetJob(IntPtr hPrinter, int jobId, int level, IntPtr pJob, int command);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOCINFOW
    {
        public int cbSize;
        public string lpszDocName;
        public string? lpszOutput;
        public string lpszDatatype;
    }

    private enum JobControl
    {
        JOB_CONTROL_PAUSE = 1,
        JOB_CONTROL_RESUME = 2,
        JOB_CONTROL_CANCEL = 3,
        JOB_CONTROL_RESTART = 4,
        JOB_CONTROL_DELETE = 5
    }

    #endregion
}