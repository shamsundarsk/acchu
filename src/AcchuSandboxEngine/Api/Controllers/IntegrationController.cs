using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Api.Models;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Configuration;
using System.Text.Json;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.IO.Compression;

namespace AcchuSandboxEngine.Api.Controllers;

/// <summary>
/// Integration controller for web and mobile frontend systems
/// Provides simplified endpoints for shopkeeper web interface and customer mobile interface
/// </summary>
[ApiController]
[Route("api/integration")]
public class IntegrationController : ControllerBase
{
    private readonly ILogger<IntegrationController> _logger;
    private readonly ISessionManager _sessionManager;
    private readonly ISecurityManager _securityManager;
    private readonly IPrintManager _printManager;
    private readonly IFileSystemManager _fileSystemManager;
    private readonly SecurityConfiguration _securityConfig;

    public IntegrationController(
        ILogger<IntegrationController> logger,
        ISessionManager sessionManager,
        ISecurityManager securityManager,
        IPrintManager printManager,
        IFileSystemManager fileSystemManager,
        IOptions<SecurityConfiguration> securityConfig)
    {
        _logger = logger;
        _sessionManager = sessionManager;
        _securityManager = securityManager;
        _printManager = printManager;
        _fileSystemManager = fileSystemManager;
        _securityConfig = securityConfig.Value;
    }

    /// <summary>
    /// Upload files from customer mobile interface
    /// </summary>
    [HttpPost("customer/upload")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<FileUploadResponse>>> UploadFiles([FromForm] CustomerFileUploadRequest request)
    {
        try
        {
            _logger.LogInformation("Processing file upload for session {SessionId}", request.SessionId);

            if (request.Files == null || !request.Files.Any())
            {
                return BadRequest(new ApiErrorResponse
                {
                    Error = "NoFiles",
                    Message = "No files provided for upload"
                });
            }

            // Check if session exists, if not create it
            var existingSession = await _sessionManager.GetSessionAsync(request.SessionId);
            if (existingSession == null || !existingSession.IsValid)
            {
                var sessionResult = await _sessionManager.StartSessionAsync(new SessionRequest
                {
                    SessionId = request.SessionId,
                    SessionToken = "demo-token" // Use demo token for now
                });

                if (!sessionResult.Success)
                {
                    return BadRequest(new ApiErrorResponse
                    {
                        Error = "SessionError",
                        Message = sessionResult.ErrorMessage ?? "Failed to start session"
                    });
                }
            }
            else
            {
                _logger.LogInformation("Reusing existing session {SessionId}", request.SessionId);
            }

            var uploadedFiles = new List<UploadedFileInfo>();

            foreach (var file in request.Files)
            {
                // Generate metadata from print preferences
                var metadata = new FileMetadata
                {
                    OriginalName = file.FileName,
                    Size = file.Length,
                    MimeType = file.ContentType,
                    PrintPreferences = new PrintPreferences
                    {
                        Copies = request.Copies,
                        ColorMode = request.ColorMode,
                        Quality = request.Quality,
                        Pages = request.Pages,
                        CustomRange = request.CustomRange
                    }
                };

                // Auto-generate filename based on preferences
                var generatedName = GenerateFileName(file.FileName, metadata.PrintPreferences);
                
                // Store file in sandbox
                var storeResult = await _fileSystemManager.StoreFileAsync(
                    request.SessionId, 
                    file.OpenReadStream(), 
                    generatedName,
                    metadata);

                if (storeResult.Success)
                {
                    uploadedFiles.Add(new UploadedFileInfo
                    {
                        FileId = storeResult.FileId!,
                        OriginalName = file.FileName,
                        GeneratedName = generatedName,
                        Size = file.Length,
                        PrintPreferences = metadata.PrintPreferences
                    });
                }
            }

            return Ok(new ApiResponse<FileUploadResponse>
            {
                Success = true,
                Data = new FileUploadResponse
                {
                    SessionId = request.SessionId,
                    UploadedFiles = uploadedFiles,
                    Message = $"Successfully uploaded {uploadedFiles.Count} files"
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading files for session {SessionId}", request.SessionId);
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "UploadError",
                Message = "Failed to upload files"
            });
        }
    }

    /// <summary>
    /// Get uploaded files for shopkeeper dashboard
    /// </summary>
    [HttpGet("shopkeeper/{sessionId}/files")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<ShopkeeperFilesResponse>>> GetShopkeeperFiles(string sessionId)
    {
        try
        {
            _logger.LogInformation("Getting files for shopkeeper session {SessionId}", sessionId);

            var files = await _fileSystemManager.GetSessionFilesAsync(sessionId);
            
            var fileList = files.Select(f => new ShopkeeperFileInfo
            {
                FileId = f.FileId,
                FileName = f.GeneratedName ?? f.OriginalName,
                OriginalName = f.OriginalName,
                Size = f.Size,
                PrintPreferences = f.PrintPreferences,
                UploadedAt = f.UploadedAt,
                EstimatedCost = CalculateEstimatedCost(f)
            }).ToList();

            return Ok(new ApiResponse<ShopkeeperFilesResponse>
            {
                Success = true,
                Data = new ShopkeeperFilesResponse
                {
                    SessionId = sessionId,
                    Files = fileList,
                    TotalFiles = fileList.Count(),
                    TotalEstimatedCost = fileList.Sum(f => f.EstimatedCost)
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting files for session {SessionId}", sessionId);
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "GetFilesError",
                Message = "Failed to retrieve files"
            });
        }
    }

    /// <summary>
    /// Execute print job for specific file
    /// </summary>
    [HttpPost("shopkeeper/{sessionId}/print/{fileId}")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<PrintExecutionResponse>>> ExecutePrintJob(string sessionId, string fileId)
    {
        try
        {
            _logger.LogInformation("Executing print job for file {FileId} in session {SessionId}", fileId, sessionId);

            // Get file info
            var fileInfo = await _fileSystemManager.GetFileInfoAsync(sessionId, fileId);
            if (fileInfo == null)
            {
                return NotFound(new ApiErrorResponse
                {
                    Error = "FileNotFound",
                    Message = "File not found in session"
                });
            }

            // Submit print job
            var printResult = await _printManager.SubmitPrintJobAsync(new AcchuSandboxEngine.Interfaces.PrintJobRequest
            {
                SessionId = sessionId,
                FileId = fileId,
                FilePath = fileInfo.FilePath,
                PrintOptions = new PrintJobOptions
                {
                    Copies = fileInfo.PrintPreferences?.Copies ?? 1,
                    ColorMode = fileInfo.PrintPreferences?.ColorMode ?? "bw",
                    Quality = fileInfo.PrintPreferences?.Quality ?? "standard"
                }
            });

            if (printResult.Success)
            {
                // Schedule cleanup after print completion
                _ = Task.Run(async () =>
                {
                    await Task.Delay(5000); // Wait 5 seconds for print to complete
                    await _sessionManager.InvalidateSessionAsync(sessionId, "Print job completed");
                });

                return Ok(new ApiResponse<PrintExecutionResponse>
                {
                    Success = true,
                    Data = new PrintExecutionResponse
                    {
                        JobId = printResult.JobId!,
                        Status = "printing",
                        Message = "Print job started successfully",
                        EstimatedCompletionTime = DateTime.UtcNow.AddMinutes(2)
                    }
                });
            }
            else
            {
                return BadRequest(new ApiErrorResponse
                {
                    Error = "PrintError",
                    Message = printResult.ErrorMessage ?? "Failed to start print job"
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing print job for file {FileId} in session {SessionId}", fileId, sessionId);
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "PrintExecutionError",
                Message = "Failed to execute print job"
            });
        }
    }

    private string GenerateFileName(string originalName, PrintPreferences preferences)
    {
        var extension = Path.GetExtension(originalName);
        var nameWithoutExt = Path.GetFileNameWithoutExtension(originalName);
        
        var parts = new List<string> { nameWithoutExt };
        
        if (preferences.Copies > 1)
            parts.Add($"{preferences.Copies}copies");
            
        if (preferences.ColorMode == "color")
            parts.Add("color");
        else
            parts.Add("bw");
            
        if (preferences.Quality == "high")
            parts.Add("hq");
            
        return string.Join("_", parts) + extension;
    }

    private decimal CalculateEstimatedCost(SessionFileInfo fileInfo)
    {
        var baseCost = 2.0m; // Base cost per page
        var pages = EstimatePageCount(fileInfo.Size, fileInfo.OriginalName);
        var copies = fileInfo.PrintPreferences?.Copies ?? 1;
        
        var cost = baseCost * pages * copies;
        
        if (fileInfo.PrintPreferences?.ColorMode == "color")
            cost *= 3; // Color printing costs 3x more
            
        return cost;
    }

    private int EstimatePageCount(long fileSize, string fileName)
    {
        // Simple estimation based on file size and type
        var extension = Path.GetExtension(fileName).ToLower();
        
        return extension switch
        {
            ".pdf" => Math.Max(1, (int)(fileSize / 100000)), // ~100KB per page
            ".doc" or ".docx" => Math.Max(1, (int)(fileSize / 50000)), // ~50KB per page
            ".txt" => Math.Max(1, (int)(fileSize / 2000)), // ~2KB per page
            _ => Math.Max(1, (int)(fileSize / 200000)) // Default ~200KB per page
        };
    }

    /// <summary>
    /// Download sandbox installer bundle
    /// </summary>
    [HttpGet("download/sandbox")]
    [AllowAnonymous]
    public async Task<ActionResult> DownloadSandbox()
    {
        try
        {
            _logger.LogInformation("Starting sandbox download");

            // Find the publish directory
            var possiblePublishPaths = new[]
            {
                Path.Combine(Directory.GetCurrentDirectory(), "publish"),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "publish"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "publish"),
                Path.Combine(Directory.GetCurrentDirectory(), "bin", "Release", "net8.0", "win-x64"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory)
            };

            string? publishPath = null;
            foreach (var path in possiblePublishPaths)
            {
                var exePath = Path.Combine(path, "AcchuSandboxEngine.exe");
                if (System.IO.File.Exists(exePath))
                {
                    publishPath = path;
                    break;
                }
            }
            
            if (publishPath == null)
            {
                _logger.LogWarning("Sandbox publish directory not found");
                return NotFound(new ApiErrorResponse
                {
                    Error = "SandboxNotFound",
                    Message = "Sandbox installer not found"
                });
            }

            // Create ZIP package
            var tempZipPath = Path.GetTempFileName();
            
            try
            {
                using (var zip = new ZipArchive(System.IO.File.Create(tempZipPath), ZipArchiveMode.Create))
                {
                    // Add Sandbox Engine files
                    var exePath = Path.Combine(publishPath, "AcchuSandboxEngine.exe");
                    if (System.IO.File.Exists(exePath))
                    {
                        zip.CreateEntryFromFile(exePath, "SandboxEngine/AcchuSandboxEngine.exe");
                    }

                    // Add configuration files
                    var configFiles = new[] { "appsettings.json", "appsettings.Production.json" };
                    foreach (var configFile in configFiles)
                    {
                        var configPath = Path.Combine(publishPath, configFile);
                        if (System.IO.File.Exists(configPath))
                        {
                            zip.CreateEntryFromFile(configPath, $"SandboxEngine/{configFile}");
                        }
                    }

                    // Add installation scripts
                    await AddInstallationScripts(zip);

                    // Add README
                    await AddReadme(zip);
                }

                var zipBytes = await System.IO.File.ReadAllBytesAsync(tempZipPath);
                var zipFileName = $"ACCHU-System-{DateTime.Now:yyyyMMdd-HHmmss}.zip";
                
                _logger.LogInformation("Serving asset bundle: {FileName} ({FileSize} bytes)", zipFileName, zipBytes.Length);
                
                return File(zipBytes, "application/zip", zipFileName);
            }
            finally
            {
                if (System.IO.File.Exists(tempZipPath))
                {
                    System.IO.File.Delete(tempZipPath);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating asset bundle");
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "DownloadFailed",
                Message = "Failed to create asset bundle"
            });
        }
    }

    /// <summary>
    /// Submit print job from mobile UI
    /// </summary>
    [HttpPost("mobile/print")]
    [AllowAnonymous]
    public async Task<ActionResult> SubmitMobilePrintJob([FromBody] MobilePrintRequest request)
    {
        try
        {
            _logger.LogInformation("Received mobile print job for session {SessionId}", request.SessionId);

            // For demo purposes, create session if it doesn't exist
            var session = await _sessionManager.GetSessionAsync(request.SessionId);
            if (session == null)
            {
                _logger.LogInformation("Session {SessionId} not found, creating demo session", request.SessionId);
                
                // Create a demo session for testing
                var sessionRequest = new SessionRequest
                {
                    SessionId = request.SessionId,
                    SessionToken = "demo-token", // Demo token for testing
                    ExpirationTime = DateTime.UtcNow.AddHours(1),
                    Metadata = new Dictionary<string, object>
                    {
                        { "ShopId", "demo-shop" },
                        { "ShopName", "Demo Shop" },
                        { "IsDemo", true }
                    }
                };

                var sessionResult = await _sessionManager.StartSessionAsync(sessionRequest);
                if (!sessionResult.Success)
                {
                    _logger.LogWarning("Failed to create demo session {SessionId}: {Error}", request.SessionId, sessionResult.ErrorMessage);
                    return BadRequest(new ApiErrorResponse
                    {
                        Error = "SessionCreationFailed",
                        Message = "Failed to create demo session for testing"
                    });
                }
                
                _logger.LogInformation("Created demo session {SessionId} successfully", request.SessionId);
            }

            var printResults = new List<object>();

            // Process each file in the print request
            foreach (var file in request.Files)
            {
                try
                {
                    // Create print job descriptor
                    var descriptor = new PrintJobDescriptor
                    {
                        FileName = file.FileName,
                        FilePath = file.FilePath,
                        PrinterName = request.PrinterName,
                        Copies = file.Copies,
                        IsColor = file.IsColor,
                        Quality = file.Quality == "high" ? PrintQuality.High : PrintQuality.Standard,
                        PaperSize = PaperSize.A4,
                        Duplex = file.IsDuplex,
                        PageRange = file.PageRange
                    };

                    // Submit to print manager
                    var result = await _printManager.SubmitPrintJobAsync(request.SessionId, descriptor);
                    
                    printResults.Add(new
                    {
                        fileName = file.FileName,
                        success = result.Success,
                        jobId = result.JobId,
                        status = result.Status.ToString(),
                        error = result.ErrorMessage
                    });

                    _logger.LogInformation("Print job {JobId} submitted for file {FileName}: {Success}", 
                        result.JobId, file.FileName, result.Success);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing print job for file {FileName}", file.FileName);
                    printResults.Add(new
                    {
                        fileName = file.FileName,
                        success = false,
                        jobId = 0,
                        status = "Failed",
                        error = ex.Message
                    });
                }
            }

            return Ok(new
            {
                success = true,
                sessionId = request.SessionId,
                results = printResults,
                message = "Print jobs submitted successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting mobile print job");
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "PrintSubmissionFailed",
                Message = "Failed to submit print job"
            });
        }
    }

    /// <summary>
    /// Get print job status for mobile UI
    /// </summary>
    [HttpGet("mobile/print/{sessionId}/status")]
    [AllowAnonymous]
    public async Task<ActionResult> GetMobilePrintStatus(string sessionId)
    {
        try
        {
            var jobs = await _printManager.GetSessionPrintJobsAsync(sessionId);
            
            return Ok(new
            {
                success = true,
                sessionId = sessionId,
                jobs = jobs.Select(job => new
                {
                    jobId = job.JobId,
                    fileName = job.FileName,
                    status = job.Status.ToString(),
                    progress = job.Progress,
                    error = job.ErrorMessage,
                    submittedAt = job.SubmittedAt,
                    completedAt = job.CompletedAt
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting mobile print status for session {SessionId}", sessionId);
            return StatusCode(500, new ApiErrorResponse
            {
                Error = "StatusRetrievalFailed",
                Message = "Failed to retrieve print status"
            });
        }
    }

    private async Task AddInstallationScripts(ZipArchive zip)
    {
        // Create installation script with fixed paths
        var installScript = @"@echo off
echo ========================================
echo ACCHU System Installation
echo ========================================
echo.

REM Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select ""Run as administrator""
    pause
    exit /b 1
)

echo Installing Sandbox Engine...
cd SandboxEngine

REM Check if Scripts directory exists
if not exist ""Scripts"" (
    echo ERROR: Scripts directory not found
    echo Current directory: %CD%
    dir
    pause
    exit /b 1
)

REM Check if install-service.bat exists
if not exist ""Scripts\install-service.bat"" (
    echo ERROR: install-service.bat not found in Scripts directory
    echo Contents of Scripts directory:
    dir Scripts\
    pause
    exit /b 1
)

echo Found install-service.bat, executing...
call Scripts\install-service.bat
if %errorLevel% neq 0 (
    echo ERROR: Failed to install Sandbox Engine
    pause
    exit /b 1
)
cd ..

echo.
echo Installation Complete!
echo.
echo The Sandbox Engine is now running as a Windows service.
echo.
echo Access Points:
echo - API Health: http://localhost:8080/api/health
echo - Asset Download: http://localhost:8080/api/integration/download/sandbox
echo.
echo Press any key to exit...
pause > nul";

        var installEntry = zip.CreateEntry("install-system.bat");
        using (var stream = installEntry.Open())
        using (var writer = new StreamWriter(stream))
        {
            await writer.WriteAsync(installScript);
        }

        // Add original installation scripts from Scripts directory
        var scriptsDir = Path.Combine(Directory.GetCurrentDirectory(), "Scripts");
        if (Directory.Exists(scriptsDir))
        {
            var scriptFiles = new[] { "install-service.bat", "uninstall-service.bat", "deploy-service.bat" };
            foreach (var scriptFile in scriptFiles)
            {
                var scriptPath = Path.Combine(scriptsDir, scriptFile);
                if (System.IO.File.Exists(scriptPath))
                {
                    zip.CreateEntryFromFile(scriptPath, $"SandboxEngine/Scripts/{scriptFile}");
                }
            }
        }
    }

    private async Task AddReadme(ZipArchive zip)
    {
        var readme = @"# ACCHU Sandbox Engine - Installation Guide

## Quick Start

1. **Extract all files** to a folder (e.g., C:\ACCHU)
2. **Run as Administrator**: `install-system.bat`
3. **Wait for installation** to complete
4. **Test the system**: Visit http://localhost:8080/api/health

## What's Included

- **SandboxEngine/**: Core .NET service and installation scripts
- **install-system.bat**: Main installation script (run as Administrator)

## Installation Steps

The installer will:
1. Check for Administrator privileges
2. Install the Sandbox Engine as a Windows service
3. Start the service automatically

## Troubleshooting

**""install-service.bat not found"" Error:**
- Make sure you extracted all files
- Check that Scripts\install-service.bat exists in the SandboxEngine folder

**Service won't start:**
- Check Windows Event Viewer for errors
- Ensure port 8080 is not in use
- Run as Administrator

## Support

- API Health Check: http://localhost:8080/api/health
- Service Status: `sc query AcchuSandboxEngine`
- Logs: Windows Event Viewer > Application

---
ACCHU Sandbox Engine v2.4.0
";

        var readmeEntry = zip.CreateEntry("README.md");
        using (var stream = readmeEntry.Open())
        using (var writer = new StreamWriter(stream))
        {
            await writer.WriteAsync(readme);
        }
    }
}