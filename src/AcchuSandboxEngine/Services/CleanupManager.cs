using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace AcchuSandboxEngine.Services;

public class CleanupManager : ICleanupManager
{
    private readonly ILogger<CleanupManager> _logger;
    private readonly SandboxConfiguration _config;
    private readonly ISessionManager _sessionManager;
    private readonly IFileSystemManager _fileSystemManager;

    // Windows Print Spooler API imports
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool EnumJobs(IntPtr hPrinter, uint FirstJob, uint NoJobs, uint Level,
        IntPtr pJob, uint cbBuf, out uint pcbNeeded, out uint pcReturned);

    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool SetJob(IntPtr hPrinter, uint JobId, uint Level, IntPtr pJob, uint Command);

    private const uint JOB_CONTROL_CANCEL = 3;
    private const uint JOB_CONTROL_DELETE = 5;

    public CleanupManager(
        ILogger<CleanupManager> logger, 
        IOptions<SandboxConfiguration> config,
        ISessionManager sessionManager,
        IFileSystemManager fileSystemManager)
    {
        _logger = logger;
        _config = config.Value;
        _sessionManager = sessionManager;
        _fileSystemManager = fileSystemManager;
    }

    public async Task<CleanupResult> PerformFullCleanupAsync(string sessionId)
    {
        _logger.LogInformation("Performing full cleanup for session {SessionId}", sessionId);
        
        var overallResult = new CleanupResult
        {
            OverwritePasses = _config.SecureDeletionPasses
        };

        try
        {
            // Step 1: Clear print spooler entries
            _logger.LogDebug("Step 1: Clearing print spooler for session {SessionId}", sessionId);
            var spoolerResult = await ClearPrintSpoolerAsync(sessionId);
            MergeCleanupResults(overallResult, spoolerResult);

            // Step 2: Secure delete sandbox files
            _logger.LogDebug("Step 2: Performing secure file deletion for session {SessionId}", sessionId);
            var fileDeleteResult = await _fileSystemManager.SecureDeleteAsync(sessionId);
            MergeCleanupResults(overallResult, fileDeleteResult);

            // Step 3: Clear temporary caches and browser data
            _logger.LogDebug("Step 3: Clearing temporary caches for session {SessionId}", sessionId);
            var cacheResult = await ClearTemporaryCachesAsync(sessionId);
            MergeCleanupResults(overallResult, cacheResult);

            // Step 4: Invalidate session token
            _logger.LogDebug("Step 4: Invalidating session token for session {SessionId}", sessionId);
            await _sessionManager.InvalidateSessionAsync(sessionId, "Full cleanup completed");
            overallResult.CleanedItems.Add($"Session token invalidated: {sessionId}");

            // Step 5: Verify no data residue remains
            _logger.LogDebug("Step 5: Verifying no data residue for session {SessionId}", sessionId);
            var verificationResult = await VerifyNoDataResidueAsync(sessionId);
            if (!verificationResult)
            {
                overallResult.FailedItems.Add("Data residue verification failed");
                _logger.LogWarning("Data residue verification failed for session {SessionId}", sessionId);
            }
            else
            {
                overallResult.CleanedItems.Add("Data residue verification passed");
            }

            // Determine overall success
            overallResult.Success = overallResult.FailedItems.Count == 0;

            _logger.LogInformation("Full cleanup completed for session {SessionId}. Success: {Success}, Cleaned: {CleanedCount}, Failed: {FailedCount}",
                sessionId, overallResult.Success, overallResult.CleanedItems.Count, overallResult.FailedItems.Count);

            return overallResult;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to perform full cleanup for session {SessionId}", sessionId);
            overallResult.Success = false;
            overallResult.ErrorMessage = ex.Message;
            return overallResult;
        }
    }

    public async Task<CleanupResult> SecureDeleteFilesAsync(string sandboxPath)
    {
        _logger.LogInformation("Performing secure delete of files in {SandboxPath}", sandboxPath);
        
        var result = new CleanupResult
        {
            OverwritePasses = _config.SecureDeletionPasses
        };

        try
        {
            if (!Directory.Exists(sandboxPath))
            {
                _logger.LogDebug("Sandbox path {SandboxPath} does not exist, nothing to clean", sandboxPath);
                result.Success = true;
                return result;
            }

            // Get all files in the sandbox directory recursively
            var files = Directory.GetFiles(sandboxPath, "*", SearchOption.AllDirectories);
            _logger.LogDebug("Found {FileCount} files to securely delete in {SandboxPath}", files.Length, sandboxPath);

            // Securely delete each file
            foreach (var filePath in files)
            {
                try
                {
                    await SecureDeleteFileAsync(filePath, _config.SecureDeletionPasses);
                    result.CleanedItems.Add(filePath);
                    _logger.LogDebug("Successfully deleted file: {FilePath}", filePath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to securely delete file: {FilePath}", filePath);
                    result.FailedItems.Add(filePath);
                }
            }

            // Remove empty directories
            try
            {
                var directories = Directory.GetDirectories(sandboxPath, "*", SearchOption.AllDirectories)
                    .OrderByDescending(d => d.Length); // Delete deepest directories first

                foreach (var directory in directories)
                {
                    try
                    {
                        if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
                        {
                            Directory.Delete(directory);
                            result.CleanedItems.Add(directory);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete directory: {Directory}", directory);
                        result.FailedItems.Add(directory);
                    }
                }

                // Finally, remove the sandbox root directory
                if (Directory.Exists(sandboxPath) && !Directory.EnumerateFileSystemEntries(sandboxPath).Any())
                {
                    Directory.Delete(sandboxPath);
                    result.CleanedItems.Add(sandboxPath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to clean up directories in sandbox: {SandboxPath}", sandboxPath);
                result.FailedItems.Add($"Directory cleanup failed: {sandboxPath}");
            }

            result.Success = result.FailedItems.Count == 0;
            
            _logger.LogInformation("Secure file deletion completed for {SandboxPath}. Cleaned: {CleanedCount}, Failed: {FailedCount}",
                sandboxPath, result.CleanedItems.Count, result.FailedItems.Count);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to perform secure delete for sandbox: {SandboxPath}", sandboxPath);
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    public async Task<CleanupResult> ClearPrintSpoolerAsync(string sessionId)
    {
        _logger.LogInformation("Clearing print spooler for session {SessionId}", sessionId);
        
        var result = new CleanupResult();

        try
        {
            // Get all available printers and clear jobs related to this session
            var printers = GetInstalledPrinters();
            _logger.LogDebug("Found {PrinterCount} printers to check for session {SessionId}", printers.Count, sessionId);

            foreach (var printerName in printers)
            {
                try
                {
                    var clearedJobs = await ClearPrinterJobsAsync(printerName, sessionId);
                    result.CleanedItems.AddRange(clearedJobs);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to clear print jobs for printer {PrinterName}", printerName);
                    result.FailedItems.Add($"Printer cleanup failed: {printerName}");
                }
            }

            // Clear Windows print spooler temporary files
            await ClearSpoolerTempFilesAsync(sessionId, result);

            result.Success = result.FailedItems.Count == 0;
            
            _logger.LogInformation("Print spooler cleanup completed for session {SessionId}. Cleaned: {CleanedCount}, Failed: {FailedCount}",
                sessionId, result.CleanedItems.Count, result.FailedItems.Count);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear print spooler for session {SessionId}", sessionId);
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    public async Task<CleanupResult> ClearTemporaryCachesAsync(string sessionId)
    {
        _logger.LogInformation("Clearing temporary caches for session {SessionId}", sessionId);
        
        var result = new CleanupResult();

        try
        {
            // Clear Windows temporary files related to the session
            await ClearWindowsTempFilesAsync(sessionId, result);

            // Clear browser caches and temporary data
            await ClearBrowserCachesAsync(sessionId, result);

            // Clear .NET temporary files
            await ClearDotNetTempFilesAsync(sessionId, result);

            // Clear Windows prefetch files related to our process
            await ClearPrefetchFilesAsync(sessionId, result);

            // Clear Windows thumbnail cache
            await ClearThumbnailCacheAsync(sessionId, result);

            result.Success = result.FailedItems.Count == 0;
            
            _logger.LogInformation("Temporary cache cleanup completed for session {SessionId}. Cleaned: {CleanedCount}, Failed: {FailedCount}",
                sessionId, result.CleanedItems.Count, result.FailedItems.Count);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear temporary caches for session {SessionId}", sessionId);
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    public async Task<bool> VerifyNoDataResidueAsync(string sessionId)
    {
        _logger.LogInformation("Verifying no data residue for session {SessionId}", sessionId);
        
        try
        {
            var residueFound = false;

            // Check 1: Verify sandbox directories are gone
            var tempDir = new DirectoryInfo(_config.TempDirectoryRoot);
            var remainingSandboxes = tempDir.GetDirectories($"acchu_sandbox_{sessionId}_*");
            if (remainingSandboxes.Length > 0)
            {
                _logger.LogWarning("Found {Count} remaining sandbox directories for session {SessionId}", 
                    remainingSandboxes.Length, sessionId);
                residueFound = true;
            }

            // Check 2: Verify no print spooler entries remain
            var spoolerResidue = await CheckPrintSpoolerResidueAsync(sessionId);
            if (spoolerResidue)
            {
                _logger.LogWarning("Print spooler residue found for session {SessionId}", sessionId);
                residueFound = true;
            }

            // Check 3: Scan temporary directories for session-related files
            var tempResidue = await ScanTemporaryDirectoriesAsync(sessionId);
            if (tempResidue)
            {
                _logger.LogWarning("Temporary file residue found for session {SessionId}", sessionId);
                residueFound = true;
            }

            // Check 4: Verify session is no longer tracked
            var sessionStatus = _sessionManager.GetSessionStatus(sessionId);
            if (sessionStatus != SessionStatus.None && sessionStatus != SessionStatus.Invalidated)
            {
                _logger.LogWarning("Session {SessionId} still has active status: {Status}", sessionId, sessionStatus);
                residueFound = true;
            }

            // Check 5: Scan for file fragments using entropy analysis
            var fragmentResidue = await ScanForFileFragmentsAsync(sessionId);
            if (fragmentResidue)
            {
                _logger.LogWarning("File fragment residue detected for session {SessionId}", sessionId);
                residueFound = true;
            }

            var verificationPassed = !residueFound;
            _logger.LogInformation("Data residue verification for session {SessionId}: {Result}", 
                sessionId, verificationPassed ? "PASSED" : "FAILED");

            return verificationPassed;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to verify data residue for session {SessionId}", sessionId);
            return false; // Fail-closed: assume residue exists if verification fails
        }
    }

    private async Task SecureDeleteFileAsync(string filePath, int passes)
    {
        try
        {
            var fileInfo = new FileInfo(filePath);
            if (!fileInfo.Exists)
            {
                return; // File already deleted
            }

            var fileSize = fileInfo.Length;
            _logger.LogDebug("Securely deleting file {FilePath} ({Size} bytes) with {Passes} passes", 
                filePath, fileSize, passes);

            // Perform multiple overwrite passes with different patterns
            for (int pass = 0; pass < passes; pass++)
            {
                using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Write, FileShare.None);
                
                // Use different patterns for each pass
                byte[] pattern = pass switch
                {
                    0 => GenerateRandomPattern(4096),
                    1 => GenerateAlternatingPattern(4096, 0x55), // 01010101
                    2 => GenerateAlternatingPattern(4096, 0xAA), // 10101010
                    _ => GenerateZeroPattern(4096)
                };

                for (long position = 0; position < fileSize; position += pattern.Length)
                {
                    var bytesToWrite = (int)Math.Min(pattern.Length, fileSize - position);
                    await fileStream.WriteAsync(pattern, 0, bytesToWrite);
                }

                await fileStream.FlushAsync();
                _logger.LogDebug("Completed pass {Pass} for file {FilePath}", pass + 1, filePath);
            }

            // Final pass with zeros
            using (var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Write, FileShare.None))
            {
                var zeroBuffer = new byte[4096];
                for (long position = 0; position < fileSize; position += zeroBuffer.Length)
                {
                    var bytesToWrite = (int)Math.Min(zeroBuffer.Length, fileSize - position);
                    await fileStream.WriteAsync(zeroBuffer, 0, bytesToWrite);
                }
                await fileStream.FlushAsync();
            }

            // Delete the file
            File.Delete(filePath);
            _logger.LogDebug("Successfully deleted file: {FilePath}", filePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to securely delete file: {FilePath}", filePath);
            throw;
        }
    }

    private static byte[] GenerateRandomPattern(int size)
    {
        var buffer = new byte[size];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(buffer);
        return buffer;
    }

    private static byte[] GenerateAlternatingPattern(int size, byte pattern)
    {
        var buffer = new byte[size];
        for (int i = 0; i < size; i++)
        {
            buffer[i] = pattern;
        }
        return buffer;
    }

    private static byte[] GenerateZeroPattern(int size)
    {
        return new byte[size]; // Already initialized to zeros
    }

    private List<string> GetInstalledPrinters()
    {
        var printers = new List<string>();
        try
        {
            // Use WMI to enumerate printers instead of System.Drawing
            using var searcher = new System.Management.ManagementObjectSearcher("SELECT Name FROM Win32_Printer");
            using var collection = searcher.Get();
            
            foreach (System.Management.ManagementObject printer in collection)
            {
                var printerName = printer["Name"]?.ToString();
                if (!string.IsNullOrEmpty(printerName))
                {
                    printers.Add(printerName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enumerate installed printers");
            
            // Fallback: try to get default printer from registry
            try
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows NT\CurrentVersion\Windows");
                var defaultPrinter = key?.GetValue("Device")?.ToString();
                if (!string.IsNullOrEmpty(defaultPrinter))
                {
                    var printerName = defaultPrinter.Split(',')[0];
                    printers.Add(printerName);
                }
            }
            catch (Exception fallbackEx)
            {
                _logger.LogError(fallbackEx, "Failed to get default printer as fallback");
            }
        }
        return printers;
    }

    private async Task<List<string>> ClearPrinterJobsAsync(string printerName, string sessionId)
    {
        var clearedJobs = new List<string>();
        
        try
        {
            if (!OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero))
            {
                _logger.LogWarning("Failed to open printer: {PrinterName}", printerName);
                return clearedJobs;
            }

            try
            {
                // Enumerate print jobs
                if (!EnumJobs(hPrinter, 0, 1000, 1, IntPtr.Zero, 0, out uint cbNeeded, out uint cReturned))
                {
                    if (cbNeeded == 0)
                    {
                        // No jobs in queue
                        return clearedJobs;
                    }

                    var pJob = Marshal.AllocHGlobal((int)cbNeeded);
                    try
                    {
                        if (EnumJobs(hPrinter, 0, 1000, 1, pJob, cbNeeded, out _, out cReturned))
                        {
                            // Process each job and cancel/delete those related to our session
                            // Note: This is a simplified implementation - in practice, you'd need to
                            // track job IDs associated with sessions more precisely
                            for (uint i = 0; i < cReturned; i++)
                            {
                                // Cancel the job (simplified - would need proper job structure parsing)
                                if (SetJob(hPrinter, i + 1, 0, IntPtr.Zero, JOB_CONTROL_CANCEL))
                                {
                                    clearedJobs.Add($"Cancelled job {i + 1} on printer {printerName}");
                                }
                            }
                        }
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(pJob);
                    }
                }
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear print jobs for printer: {PrinterName}", printerName);
        }

        return clearedJobs;
    }

    private async Task ClearSpoolerTempFilesAsync(string sessionId, CleanupResult result)
    {
        try
        {
            // Windows print spooler temp directory
            var spoolerPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), 
                @"spool\PRINTERS");
            
            if (Directory.Exists(spoolerPath))
            {
                var spoolerFiles = Directory.GetFiles(spoolerPath, "*.*");
                foreach (var file in spoolerFiles)
                {
                    try
                    {
                        // Check if file might be related to our session (simplified heuristic)
                        var fileInfo = new FileInfo(file);
                        var timeDiff = DateTime.Now - fileInfo.CreationTime;
                        
                        // Only delete recent files (within session timeframe)
                        if (timeDiff.TotalHours < _config.MaxSessionDurationMinutes / 60.0 + 1)
                        {
                            await SecureDeleteFileAsync(file, 1); // Single pass for temp files
                            result.CleanedItems.Add($"Spooler temp file: {file}");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete spooler temp file: {File}", file);
                        result.FailedItems.Add($"Spooler temp file: {file}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear spooler temp files for session {SessionId}", sessionId);
            result.FailedItems.Add("Spooler temp files cleanup failed");
        }
    }

    private async Task ClearWindowsTempFilesAsync(string sessionId, CleanupResult result)
    {
        try
        {
            var tempPaths = new[]
            {
                Path.GetTempPath(),
                Environment.GetFolderPath(Environment.SpecialFolder.InternetCache),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temp")
            };

            foreach (var tempPath in tempPaths)
            {
                if (!Directory.Exists(tempPath)) continue;

                try
                {
                    // Look for files that might be related to our session
                    var sessionFiles = Directory.GetFiles(tempPath, $"*{sessionId}*", SearchOption.TopDirectoryOnly);
                    var recentFiles = Directory.GetFiles(tempPath, "*acchu*", SearchOption.TopDirectoryOnly)
                        .Where(f => (DateTime.Now - new FileInfo(f).CreationTime).TotalHours < 2);

                    var filesToClean = sessionFiles.Concat(recentFiles).Distinct();

                    foreach (var file in filesToClean)
                    {
                        try
                        {
                            await SecureDeleteFileAsync(file, 1);
                            result.CleanedItems.Add($"Temp file: {file}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to delete temp file: {File}", file);
                            result.FailedItems.Add($"Temp file: {file}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to scan temp directory: {TempPath}", tempPath);
                    result.FailedItems.Add($"Temp directory scan failed: {tempPath}");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear Windows temp files for session {SessionId}", sessionId);
            result.FailedItems.Add("Windows temp files cleanup failed");
        }
    }

    private async Task ClearBrowserCachesAsync(string sessionId, CleanupResult result)
    {
        try
        {
            // Clear common browser cache locations that might contain traces
            var browserCachePaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
                    @"Microsoft\Windows\INetCache"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
                    @"Microsoft\Windows\WebCache"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
                    @"Google\Chrome\User Data\Default\Cache"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
                    @"Mozilla\Firefox\Profiles")
            };

            foreach (var cachePath in browserCachePaths)
            {
                if (!Directory.Exists(cachePath)) continue;

                try
                {
                    // Only clear recent cache files that might contain session data
                    var recentCacheFiles = Directory.GetFiles(cachePath, "*", SearchOption.AllDirectories)
                        .Where(f => (DateTime.Now - new FileInfo(f).CreationTime).TotalHours < 2)
                        .Take(100); // Limit to prevent excessive cleanup

                    foreach (var file in recentCacheFiles)
                    {
                        try
                        {
                            File.Delete(file); // Regular delete for cache files
                            result.CleanedItems.Add($"Browser cache: {Path.GetFileName(file)}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug(ex, "Failed to delete browser cache file: {File}", file);
                            // Don't add to failed items - browser cache cleanup is best-effort
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to scan browser cache directory: {CachePath}", cachePath);
                    // Don't add to failed items - browser cache cleanup is best-effort
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear browser caches for session {SessionId}", sessionId);
            result.FailedItems.Add("Browser cache cleanup failed");
        }
    }

    private async Task ClearDotNetTempFilesAsync(string sessionId, CleanupResult result)
    {
        try
        {
            var dotNetTempPath = Path.Combine(Path.GetTempPath(), "Temporary ASP.NET Files");
            if (Directory.Exists(dotNetTempPath))
            {
                var recentFiles = Directory.GetFiles(dotNetTempPath, "*", SearchOption.AllDirectories)
                    .Where(f => (DateTime.Now - new FileInfo(f).CreationTime).TotalHours < 1)
                    .Take(50); // Limit cleanup scope

                foreach (var file in recentFiles)
                {
                    try
                    {
                        File.Delete(file);
                        result.CleanedItems.Add($".NET temp file: {Path.GetFileName(file)}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to delete .NET temp file: {File}", file);
                        // Best-effort cleanup
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear .NET temp files for session {SessionId}", sessionId);
            result.FailedItems.Add(".NET temp files cleanup failed");
        }
    }

    private async Task ClearPrefetchFilesAsync(string sessionId, CleanupResult result)
    {
        try
        {
            var prefetchPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Prefetch");
            if (Directory.Exists(prefetchPath))
            {
                // Look for prefetch files related to our process
                var processName = Process.GetCurrentProcess().ProcessName.ToUpperInvariant();
                var prefetchFiles = Directory.GetFiles(prefetchPath, $"{processName}*.pf");

                foreach (var file in prefetchFiles)
                {
                    try
                    {
                        File.Delete(file);
                        result.CleanedItems.Add($"Prefetch file: {Path.GetFileName(file)}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to delete prefetch file: {File}", file);
                        // Best-effort cleanup
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear prefetch files for session {SessionId}", sessionId);
            result.FailedItems.Add("Prefetch files cleanup failed");
        }
    }

    private async Task ClearThumbnailCacheAsync(string sessionId, CleanupResult result)
    {
        try
        {
            var thumbnailPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Microsoft\Windows\Explorer");
            
            if (Directory.Exists(thumbnailPath))
            {
                var thumbnailFiles = Directory.GetFiles(thumbnailPath, "thumbcache_*.db");
                foreach (var file in thumbnailFiles)
                {
                    try
                    {
                        // Only delete if recently modified
                        var fileInfo = new FileInfo(file);
                        if ((DateTime.Now - fileInfo.LastWriteTime).TotalHours < 2)
                        {
                            File.Delete(file);
                            result.CleanedItems.Add($"Thumbnail cache: {Path.GetFileName(file)}");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to delete thumbnail cache: {File}", file);
                        // Best-effort cleanup
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear thumbnail cache for session {SessionId}", sessionId);
            result.FailedItems.Add("Thumbnail cache cleanup failed");
        }
    }

    private async Task<bool> CheckPrintSpoolerResidueAsync(string sessionId)
    {
        try
        {
            var printers = GetInstalledPrinters();
            foreach (var printerName in printers)
            {
                if (OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero))
                {
                    try
                    {
                        // Check if there are any jobs in the queue
                        if (EnumJobs(hPrinter, 0, 1000, 1, IntPtr.Zero, 0, out uint cbNeeded, out uint cReturned))
                        {
                            if (cReturned > 0)
                            {
                                _logger.LogWarning("Found {JobCount} print jobs remaining in printer {PrinterName}", 
                                    cReturned, printerName);
                                return true; // Residue found
                            }
                        }
                    }
                    finally
                    {
                        ClosePrinter(hPrinter);
                    }
                }
            }
            return false; // No residue found
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check print spooler residue for session {SessionId}", sessionId);
            return true; // Assume residue exists if check fails (fail-closed)
        }
    }

    private async Task<bool> ScanTemporaryDirectoriesAsync(string sessionId)
    {
        try
        {
            var tempPaths = new[]
            {
                Path.GetTempPath(),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Temp"
            };

            foreach (var tempPath in tempPaths)
            {
                if (!Directory.Exists(tempPath)) continue;

                // Look for any files or directories containing the session ID
                var sessionFiles = Directory.GetFiles(tempPath, $"*{sessionId}*", SearchOption.AllDirectories);
                var sessionDirs = Directory.GetDirectories(tempPath, $"*{sessionId}*", SearchOption.AllDirectories);

                if (sessionFiles.Length > 0 || sessionDirs.Length > 0)
                {
                    _logger.LogWarning("Found {FileCount} files and {DirCount} directories with session ID in {TempPath}",
                        sessionFiles.Length, sessionDirs.Length, tempPath);
                    return true; // Residue found
                }
            }

            return false; // No residue found
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to scan temporary directories for session {SessionId}", sessionId);
            return true; // Assume residue exists if scan fails (fail-closed)
        }
    }

    private async Task<bool> ScanForFileFragmentsAsync(string sessionId)
    {
        try
        {
            // This is a simplified implementation of fragment detection
            // In a production system, you might use more sophisticated forensic tools
            
            var tempDir = new DirectoryInfo(_config.TempDirectoryRoot);
            var recentFiles = tempDir.GetFiles("*", SearchOption.AllDirectories)
                .Where(f => (DateTime.Now - f.CreationTime).TotalHours < 2)
                .Take(100); // Limit scan scope

            foreach (var file in recentFiles)
            {
                try
                {
                    // Quick entropy check to detect potential data fragments
                    using var fileStream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read);
                    var buffer = new byte[Math.Min(1024, fileStream.Length)];
                    await fileStream.ReadAsync(buffer, 0, buffer.Length);

                    // Simple entropy calculation
                    var entropy = CalculateEntropy(buffer);
                    
                    // High entropy might indicate encrypted or compressed data fragments
                    if (entropy > 7.5) // Threshold for suspicious entropy
                    {
                        _logger.LogDebug("High entropy file detected: {FileName} (entropy: {Entropy})", 
                            file.Name, entropy);
                        
                        // Additional check: look for session-related patterns
                        var content = Encoding.UTF8.GetString(buffer, 0, Math.Min(buffer.Length, 512));
                        if (content.Contains(sessionId, StringComparison.OrdinalIgnoreCase))
                        {
                            _logger.LogWarning("File fragment containing session ID detected: {FileName}", file.Name);
                            return true; // Fragment residue found
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to scan file for fragments: {FileName}", file.Name);
                    // Continue scanning other files
                }
            }

            return false; // No fragments found
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to scan for file fragments for session {SessionId}", sessionId);
            return true; // Assume fragments exist if scan fails (fail-closed)
        }
    }

    private static double CalculateEntropy(byte[] data)
    {
        if (data.Length == 0) return 0;

        var frequency = new int[256];
        foreach (var b in data)
        {
            frequency[b]++;
        }

        double entropy = 0;
        var length = data.Length;

        for (int i = 0; i < 256; i++)
        {
            if (frequency[i] > 0)
            {
                var probability = (double)frequency[i] / length;
                entropy -= probability * Math.Log2(probability);
            }
        }

        return entropy;
    }

    private static void MergeCleanupResults(CleanupResult target, CleanupResult source)
    {
        target.CleanedItems.AddRange(source.CleanedItems);
        target.FailedItems.AddRange(source.FailedItems);
        
        if (!string.IsNullOrEmpty(source.ErrorMessage))
        {
            if (string.IsNullOrEmpty(target.ErrorMessage))
            {
                target.ErrorMessage = source.ErrorMessage;
            }
            else
            {
                target.ErrorMessage += "; " + source.ErrorMessage;
            }
        }
    }
}