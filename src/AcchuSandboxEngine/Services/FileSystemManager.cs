using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Security;
using System.Text.Json;

namespace AcchuSandboxEngine.Services;

public class FileSystemManager : IFileSystemManager
{
    private readonly ILogger<FileSystemManager> _logger;
    private readonly SandboxConfiguration _config;
    private readonly Dictionary<string, string> _sessionSandboxes = new();
    private readonly object _lockObject = new();
    private readonly ISecurityManager _securityManager;

    public FileSystemManager(
        ILogger<FileSystemManager> logger, 
        IOptions<SandboxConfiguration> config,
        ISecurityManager securityManager)
    {
        _logger = logger;
        _config = config.Value;
        _securityManager = securityManager;
    }

    public async Task<SandboxResult> CreateSandboxAsync(string sessionId)
    {
        _logger.LogInformation("Creating sandbox for session {SessionId}", sessionId);
        
        try
        {
            // Generate unique sandbox directory name
            var sandboxName = $"acchu_sandbox_{sessionId}_{Guid.NewGuid():N}";
            var sandboxPath = Path.Combine(_config.TempDirectoryRoot, sandboxName);

            // Create the directory
            var directoryInfo = Directory.CreateDirectory(sandboxPath);
            
            // Get the current service account SID
            var serviceSid = GetServiceAccountSid();
            
            // Apply Windows ACLs to restrict access
            await ApplySecurityAclsAsync(directoryInfo, serviceSid);
            
            // Store the sandbox path for this session
            lock (_lockObject)
            {
                _sessionSandboxes[sessionId] = sandboxPath;
            }
            
            _logger.LogInformation("Successfully created sandbox at {SandboxPath} for session {SessionId}", 
                sandboxPath, sessionId);
            
            return new SandboxResult
            {
                Success = true,
                SandboxPath = sandboxPath,
                ServiceSid = serviceSid
            };
        }
        catch (UnauthorizedAccessException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Unauthorized access during sandbox creation");
            return new SandboxResult
            {
                Success = false,
                ErrorMessage = "Access denied - insufficient permissions to create sandbox"
            };
        }
        catch (DirectoryNotFoundException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Directory service error during sandbox creation");
            return new SandboxResult
            {
                Success = false,
                ErrorMessage = "Directory service error during sandbox creation"
            };
        }
        catch (IOException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "I/O error during sandbox creation");
            return new SandboxResult
            {
                Success = false,
                ErrorMessage = "I/O error during sandbox creation"
            };
        }
        catch (Exception ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Unexpected error during sandbox creation");
            return new SandboxResult
            {
                Success = false,
                ErrorMessage = "Failed to create sandbox due to internal error"
            };
        }
    }

    public async Task<FileResult> StoreFileAsync(string sessionId, Stream fileStream, string fileName)
    {
        _logger.LogInformation("Storing file {FileName} for session {SessionId}", fileName, sessionId);
        
        try
        {
            // Get the sandbox path for this session
            string? sandboxPath;
            lock (_lockObject)
            {
                if (!_sessionSandboxes.TryGetValue(sessionId, out sandboxPath))
                {
                    sandboxPath = null;
                }
            }

            if (sandboxPath == null)
            {
                await HandleFileSystemErrorAsync(sessionId, new InvalidOperationException("Sandbox not found"), "File storage attempted without sandbox");
                return new FileResult
                {
                    Success = false,
                    ErrorMessage = "Sandbox not found for session"
                };
            }

            // Validate file size
            if (fileStream.Length > _config.MaxFileSizeBytes)
            {
                await HandleFileSystemErrorAsync(sessionId, new ArgumentException($"File size {fileStream.Length} exceeds limit"), "File size limit exceeded");
                return new FileResult
                {
                    Success = false,
                    ErrorMessage = $"File size exceeds maximum allowed size of {_config.MaxFileSizeBytes} bytes"
                };
            }

            // Validate file type against whitelist
            var fileExtension = Path.GetExtension(fileName).ToLowerInvariant();
            if (!_config.AllowedFileTypes.Contains(fileExtension))
            {
                await HandleFileSystemErrorAsync(sessionId, new ArgumentException($"File type {fileExtension} not allowed"), "Unauthorized file type");
                return new FileResult
                {
                    Success = false,
                    ErrorMessage = $"File type {fileExtension} is not allowed"
                };
            }

            // Validate file name for security
            if (!IsValidFileName(fileName))
            {
                await HandleFileSystemErrorAsync(sessionId, new ArgumentException("Invalid file name"), "Invalid file name detected");
                return new FileResult
                {
                    Success = false,
                    ErrorMessage = "Invalid file name detected"
                };
            }

            // Create secure file path
            var safeFileName = Path.GetFileName(fileName);
            var filePath = Path.Combine(sandboxPath, safeFileName);
            
            // Store the file and calculate hash
            var fileHash = await StoreFileWithHashAsync(fileStream, filePath);
            var fileSize = new FileInfo(filePath).Length;
            
            // Perform comprehensive file validation after storage
            if (!await ValidateFileContentAsync(filePath))
            {
                // Delete the invalid file
                try
                {
                    File.Delete(filePath);
                }
                catch (Exception deleteEx)
                {
                    _logger.LogError(deleteEx, "Failed to delete invalid file {FilePath}", filePath);
                }
                
                await HandleFileSystemErrorAsync(sessionId, new SecurityException("File failed security validation"), "File security validation failed");
                return new FileResult
                {
                    Success = false,
                    ErrorMessage = "File failed security validation"
                };
            }
            
            _logger.LogInformation("Successfully stored and validated file {FileName} at {FilePath} for session {SessionId}", 
                fileName, filePath, sessionId);
            
            return new FileResult
            {
                Success = true,
                FilePath = filePath,
                FileSize = fileSize,
                FileHash = fileHash
            };
        }
        catch (UnauthorizedAccessException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Unauthorized access during file storage");
            return new FileResult
            {
                Success = false,
                ErrorMessage = "Access denied during file storage"
            };
        }
        catch (IOException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "I/O error during file storage");
            return new FileResult
            {
                Success = false,
                ErrorMessage = "I/O error during file storage"
            };
        }
        catch (SecurityException ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Security error during file storage");
            return new FileResult
            {
                Success = false,
                ErrorMessage = "Security validation failed"
            };
        }
        catch (Exception ex)
        {
            await HandleFileSystemErrorAsync(sessionId, ex, "Unexpected error during file storage");
            return new FileResult
            {
                Success = false,
                ErrorMessage = "Failed to store file due to internal error"
            };
        }
    }

    public async Task<bool> ValidateFileAsync(string sessionId, string fileName)
    {
        _logger.LogInformation("Validating file {FileName} for session {SessionId}", fileName, sessionId);
        
        try
        {
            // Get the sandbox path for this session
            string sandboxPath;
            lock (_lockObject)
            {
                if (!_sessionSandboxes.TryGetValue(sessionId, out sandboxPath))
                {
                    _logger.LogWarning("Sandbox not found for session {SessionId}", sessionId);
                    return false;
                }
            }

            var filePath = Path.Combine(sandboxPath, fileName);
            
            // Check if file exists
            if (!File.Exists(filePath))
            {
                _logger.LogWarning("File {FileName} not found in sandbox for session {SessionId}", fileName, sessionId);
                return false;
            }

            // Validate file headers and content
            var isValid = await ValidateFileContentAsync(filePath);
            
            _logger.LogInformation("File validation result for {FileName} in session {SessionId}: {IsValid}", 
                fileName, sessionId, isValid);
            
            return isValid;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate file {FileName} for session {SessionId}", fileName, sessionId);
            return false;
        }
    }

    public async Task<FileStoreResult> StoreFileAsync(string sessionId, Stream fileStream, string fileName, FileMetadata metadata)
    {
        try
        {
            _logger.LogInformation("Storing file {FileName} for session {SessionId}", fileName, sessionId);

            // Get or create sandbox for session
            string sandboxPath;
            
            if (!_sessionSandboxes.TryGetValue(sessionId, out sandboxPath))
            {
                // Create sandbox if it doesn't exist
                var sandboxResult = await CreateSandboxAsync(sessionId);
                if (!sandboxResult.Success)
                {
                    return new FileStoreResult
                    {
                        Success = false,
                        ErrorMessage = "Failed to create sandbox for file storage"
                    };
                }
                sandboxPath = sandboxResult.SandboxPath!;
                
                lock (_lockObject)
                {
                    _sessionSandboxes[sessionId] = sandboxPath;
                }
            }

            // Generate unique file ID
            var fileId = Guid.NewGuid().ToString("N");
            var filePath = Path.Combine(sandboxPath, fileName);
            var metadataPath = Path.Combine(sandboxPath, $"{fileId}.metadata.json");

            // Store the file
            using (var fileOutput = File.Create(filePath))
            {
                await fileStream.CopyToAsync(fileOutput);
            }

            // Store metadata
            var metadataJson = JsonSerializer.Serialize(new
            {
                FileId = fileId,
                OriginalName = metadata.OriginalName,
                GeneratedName = fileName,
                Size = metadata.Size,
                MimeType = metadata.MimeType,
                PrintPreferences = metadata.PrintPreferences,
                UploadedAt = DateTime.UtcNow,
                FilePath = filePath
            }, new JsonSerializerOptions { WriteIndented = true });

            await File.WriteAllTextAsync(metadataPath, metadataJson);

            _logger.LogInformation("Successfully stored file {FileName} with ID {FileId} for session {SessionId}", 
                fileName, fileId, sessionId);

            return new FileStoreResult
            {
                Success = true,
                FileId = fileId
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error storing file {FileName} for session {SessionId}", fileName, sessionId);
            return new FileStoreResult
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    public async Task<List<SessionFileInfo>> GetSessionFilesAsync(string sessionId)
    {
        try
        {
            var files = new List<SessionFileInfo>();

            lock (_lockObject)
            {
                if (!_sessionSandboxes.TryGetValue(sessionId, out var sandboxPath))
                {
                    return files; // Return empty list if no sandbox exists
                }

                // Find all metadata files
                var metadataFiles = Directory.GetFiles(sandboxPath, "*.metadata.json");

                foreach (var metadataFile in metadataFiles)
                {
                    try
                    {
                        var json = File.ReadAllText(metadataFile);
                        var metadata = JsonSerializer.Deserialize<JsonElement>(json);

                        files.Add(new SessionFileInfo
                        {
                            FileId = metadata.GetProperty("FileId").GetString() ?? "",
                            OriginalName = metadata.GetProperty("OriginalName").GetString() ?? "",
                            GeneratedName = metadata.GetProperty("GeneratedName").GetString(),
                            FilePath = metadata.GetProperty("FilePath").GetString() ?? "",
                            Size = metadata.GetProperty("Size").GetInt64(),
                            PrintPreferences = JsonSerializer.Deserialize<PrintPreferences>(
                                metadata.GetProperty("PrintPreferences").GetRawText()),
                            UploadedAt = metadata.GetProperty("UploadedAt").GetDateTime()
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to parse metadata file {MetadataFile}", metadataFile);
                    }
                }
            }

            return files.OrderBy(f => f.UploadedAt).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting files for session {SessionId}", sessionId);
            return new List<SessionFileInfo>();
        }
    }

    public async Task<SessionFileInfo?> GetFileInfoAsync(string sessionId, string fileId)
    {
        try
        {
            var files = await GetSessionFilesAsync(sessionId);
            return files.FirstOrDefault(f => f.FileId == fileId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting file info for {FileId} in session {SessionId}", fileId, sessionId);
            return null;
        }
    }

    public async Task<CleanupResult> SecureDeleteAsync(string sessionId)
    {
        _logger.LogInformation("Performing secure delete for session {SessionId}", sessionId);
        
        var result = new CleanupResult
        {
            OverwritePasses = _config.SecureDeletionPasses
        };

        try
        {
            // Get the sandbox path for this session
            string sandboxPath;
            lock (_lockObject)
            {
                if (!_sessionSandboxes.TryGetValue(sessionId, out sandboxPath))
                {
                    result.Success = true; // Nothing to clean
                    return result;
                }
                
                // Remove from tracking
                _sessionSandboxes.Remove(sessionId);
            }

            if (!Directory.Exists(sandboxPath))
            {
                result.Success = true; // Already cleaned
                return result;
            }

            // Securely delete all files in the sandbox
            var files = Directory.GetFiles(sandboxPath, "*", SearchOption.AllDirectories);
            
            foreach (var file in files)
            {
                try
                {
                    await SecureDeleteFileAsync(file, _config.SecureDeletionPasses);
                    result.CleanedItems.Add(file);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to securely delete file {FilePath}", file);
                    result.FailedItems.Add(file);
                }
            }

            // Remove the directory structure
            try
            {
                Directory.Delete(sandboxPath, true);
                result.CleanedItems.Add(sandboxPath);
                result.Success = result.FailedItems.Count == 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete sandbox directory {SandboxPath}", sandboxPath);
                result.FailedItems.Add(sandboxPath);
                result.Success = false;
            }

            _logger.LogInformation("Secure delete completed for session {SessionId}. Cleaned: {CleanedCount}, Failed: {FailedCount}", 
                sessionId, result.CleanedItems.Count, result.FailedItems.Count);
            
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to perform secure delete for session {SessionId}", sessionId);
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    public async Task<bool> VerifyCleanupAsync(string sessionId)
    {
        _logger.LogInformation("Verifying cleanup for session {SessionId}", sessionId);
        
        try
        {
            // Check if session is still tracked
            lock (_lockObject)
            {
                if (_sessionSandboxes.ContainsKey(sessionId))
                {
                    _logger.LogWarning("Session {SessionId} still tracked after cleanup", sessionId);
                    return false;
                }
            }

            // Scan temp directory for any remaining sandbox directories for this session
            var tempDir = new DirectoryInfo(_config.TempDirectoryRoot);
            var remainingDirs = tempDir.GetDirectories($"acchu_sandbox_{sessionId}_*");
            
            if (remainingDirs.Length > 0)
            {
                _logger.LogWarning("Found {Count} remaining sandbox directories for session {SessionId}", 
                    remainingDirs.Length, sessionId);
                return false;
            }

            _logger.LogInformation("Cleanup verification successful for session {SessionId}", sessionId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to verify cleanup for session {SessionId}", sessionId);
            return false;
        }
    }

    private SecurityIdentifier GetServiceAccountSid()
    {
        try
        {
            // Try to get the current process SID first
            var currentIdentity = WindowsIdentity.GetCurrent();
            if (currentIdentity?.User != null)
            {
                return currentIdentity.User;
            }

            // Fallback to LOCAL SERVICE SID
            return new SecurityIdentifier(WellKnownSidType.LocalServiceSid, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get service account SID, using LOCAL SERVICE");
            return new SecurityIdentifier(WellKnownSidType.LocalServiceSid, null);
        }
    }

    private async Task ApplySecurityAclsAsync(DirectoryInfo directory, SecurityIdentifier serviceSid)
    {
        await Task.Run(() =>
        {
            var directorySecurity = new DirectorySecurity();
            
            // Remove inherited permissions
            directorySecurity.SetAccessRuleProtection(true, false);
            
            // Grant full control to the service account
            var serviceRule = new FileSystemAccessRule(
                serviceSid,
                FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow);
            
            directorySecurity.AddAccessRule(serviceRule);
            
            // Grant full control to SYSTEM (required for Windows operations)
            var systemRule = new FileSystemAccessRule(
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow);
            
            directorySecurity.AddAccessRule(systemRule);
            
            // Apply the security settings
            directory.SetAccessControl(directorySecurity);
        });
    }

    private async Task<string> StoreFileWithHashAsync(Stream fileStream, string filePath)
    {
        using var sha256 = SHA256.Create();
        using var fileOutput = new FileStream(filePath, FileMode.Create, FileAccess.Write);
        using var cryptoStream = new CryptoStream(fileOutput, sha256, CryptoStreamMode.Write);
        
        await fileStream.CopyToAsync(cryptoStream);
        cryptoStream.FlushFinalBlock();
        
        var hash = sha256.Hash;
        return Convert.ToHexString(hash);
    }

    private async Task<bool> ValidateFileContentAsync(string filePath)
    {
        try
        {
            // Read file header to validate file type
            using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
            var buffer = new byte[1024]; // Read first 1024 bytes for comprehensive header validation
            var bytesRead = await fileStream.ReadAsync(buffer, 0, buffer.Length);
            
            if (bytesRead == 0)
            {
                _logger.LogWarning("Empty file detected: {FilePath}", filePath);
                return false; // Empty file
            }

            // Get file extension for validation
            var fileExtension = Path.GetExtension(filePath).ToLowerInvariant();
            
            // Validate file header matches declared file type
            if (!ValidateFileHeader(buffer, fileExtension))
            {
                _logger.LogWarning("File header validation failed for {FilePath} with extension {Extension}", filePath, fileExtension);
                return false;
            }

            // Check for executable content
            if (IsExecutableFile(buffer))
            {
                _logger.LogWarning("Executable file detected: {FilePath}", filePath);
                return false;
            }

            // Check for script content
            if (ContainsScriptContent(buffer, fileExtension))
            {
                _logger.LogWarning("Script content detected: {FilePath}", filePath);
                return false;
            }

            // Perform malware scanning integration point
            if (!await PerformMalwareScanAsync(filePath))
            {
                _logger.LogWarning("Malware scan failed for: {FilePath}", filePath);
                return false;
            }

            _logger.LogDebug("File content validation passed for: {FilePath}", filePath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate file content for {FilePath}", filePath);
            return false;
        }
    }

    private static bool IsExecutableFile(byte[] header)
    {
        if (header.Length < 4) return false;

        // Check for common executable signatures
        
        // DOS/Windows executable (MZ header)
        if (header.Length >= 2 && header[0] == 0x4D && header[1] == 0x5A) return true;
        
        // ELF executable (Linux/Unix)
        if (header[0] == 0x7F && header[1] == 0x45 && header[2] == 0x4C && header[3] == 0x46) return true;
        
        // Mach-O executable (macOS) - 32-bit and 64-bit variants
        if ((header[0] == 0xFE && header[1] == 0xED && header[2] == 0xFA && header[3] == 0xCE) ||
            (header[0] == 0xCE && header[1] == 0xFA && header[2] == 0xED && header[3] == 0xFE) ||
            (header[0] == 0xFE && header[1] == 0xED && header[2] == 0xFA && header[3] == 0xCF) ||
            (header[0] == 0xCF && header[1] == 0xFA && header[2] == 0xED && header[3] == 0xFE)) return true;

        // Java class files
        if (header[0] == 0xCA && header[1] == 0xFE && header[2] == 0xBA && header[3] == 0xBE) return true;

        // Check for shebang in scripts
        if (header.Length >= 2 && header[0] == 0x23 && header[1] == 0x21) return true; // #!

        return false;
    }

    private bool ValidateFileHeader(byte[] header, string fileExtension)
    {
        if (header.Length < 4) return false;

        return fileExtension switch
        {
            ".pdf" => ValidatePdfHeader(header),
            ".jpg" or ".jpeg" => ValidateJpegHeader(header),
            ".png" => ValidatePngHeader(header),
            ".doc" => ValidateDocHeader(header),
            ".docx" => ValidateDocxHeader(header),
            ".txt" => ValidateTextHeader(header),
            _ => false // Unknown file type
        };
    }

    private static bool ValidatePdfHeader(byte[] header)
    {
        // PDF files start with "%PDF-"
        return header.Length >= 5 &&
               header[0] == 0x25 && // %
               header[1] == 0x50 && // P
               header[2] == 0x44 && // D
               header[3] == 0x46 && // F
               header[4] == 0x2D;   // -
    }

    private static bool ValidateJpegHeader(byte[] header)
    {
        // JPEG files start with FF D8 FF
        return header.Length >= 3 &&
               header[0] == 0xFF &&
               header[1] == 0xD8 &&
               header[2] == 0xFF;
    }

    private static bool ValidatePngHeader(byte[] header)
    {
        // PNG files start with 89 50 4E 47 0D 0A 1A 0A
        return header.Length >= 8 &&
               header[0] == 0x89 &&
               header[1] == 0x50 && // P
               header[2] == 0x4E && // N
               header[3] == 0x47 && // G
               header[4] == 0x0D &&
               header[5] == 0x0A &&
               header[6] == 0x1A &&
               header[7] == 0x0A;
    }

    private static bool ValidateDocHeader(byte[] header)
    {
        // Legacy DOC files start with D0 CF 11 E0 A1 B1 1A E1 (OLE2 signature)
        return header.Length >= 8 &&
               header[0] == 0xD0 &&
               header[1] == 0xCF &&
               header[2] == 0x11 &&
               header[3] == 0xE0 &&
               header[4] == 0xA1 &&
               header[5] == 0xB1 &&
               header[6] == 0x1A &&
               header[7] == 0xE1;
    }

    private static bool ValidateDocxHeader(byte[] header)
    {
        // DOCX files are ZIP archives, start with PK (50 4B)
        return header.Length >= 4 &&
               header[0] == 0x50 && // P
               header[1] == 0x4B && // K
               (header[2] == 0x03 || header[2] == 0x05 || header[2] == 0x07) &&
               (header[3] == 0x04 || header[3] == 0x06 || header[3] == 0x08);
    }

    private static bool ValidateTextHeader(byte[] header)
    {
        // Text files should contain only printable ASCII or UTF-8 characters
        // Check first 512 bytes for non-printable characters (excluding common whitespace)
        var checkLength = Math.Min(header.Length, 512);
        
        for (int i = 0; i < checkLength; i++)
        {
            var b = header[i];
            
            // Allow common whitespace characters
            if (b == 0x09 || b == 0x0A || b == 0x0D || b == 0x20) continue;
            
            // Allow printable ASCII
            if (b >= 0x20 && b <= 0x7E) continue;
            
            // Allow UTF-8 BOM
            if (i == 0 && checkLength >= 3 && 
                header[0] == 0xEF && header[1] == 0xBB && header[2] == 0xBF) continue;
            
            // Allow UTF-8 continuation bytes
            if (b >= 0x80 && b <= 0xBF) continue;
            
            // Allow UTF-8 start bytes
            if (b >= 0xC0 && b <= 0xF7) continue;
            
            // Reject control characters and other non-printable bytes
            return false;
        }
        
        return true;
    }

    private bool ContainsScriptContent(byte[] header, string fileExtension)
    {
        // Convert header to string for script detection
        var headerText = Encoding.UTF8.GetString(header, 0, Math.Min(header.Length, 512)).ToLowerInvariant();
        
        // Check for script indicators in text files
        if (fileExtension == ".txt")
        {
            var scriptIndicators = new[]
            {
                "#!/bin/", "#!/usr/bin/", "powershell", "cmd.exe", "wscript", "cscript",
                "<script", "javascript:", "vbscript:", "eval(", "exec(", "system(",
                "import os", "import sys", "subprocess", "__import__"
            };
            
            return scriptIndicators.Any(indicator => headerText.Contains(indicator));
        }
        
        // Check for embedded scripts in other file types
        var embeddedScriptIndicators = new[]
        {
            "<script", "javascript:", "vbscript:", "activex", "object classid"
        };
        
        return embeddedScriptIndicators.Any(indicator => headerText.Contains(indicator));
    }

    private async Task<bool> PerformMalwareScanAsync(string filePath)
    {
        try
        {
            // Integration point for malware scanning
            // This is where you would integrate with Windows Defender, ClamAV, or other antivirus solutions
            
            _logger.LogDebug("Performing malware scan for file: {FilePath}", filePath);
            
            // For now, implement basic heuristic checks
            var fileInfo = new FileInfo(filePath);
            
            // Check file size - extremely large files might be suspicious
            if (fileInfo.Length > _config.MaxFileSizeBytes)
            {
                _logger.LogWarning("File size exceeds maximum allowed: {FilePath} ({Size} bytes)", filePath, fileInfo.Length);
                return false;
            }
            
            // Check for suspicious file names
            var fileName = Path.GetFileName(filePath).ToLowerInvariant();
            var suspiciousNames = new[]
            {
                "autorun", "setup", "install", "update", "patch", "crack", "keygen",
                "virus", "trojan", "malware", "backdoor", "rootkit"
            };
            
            if (suspiciousNames.Any(name => fileName.Contains(name)))
            {
                _logger.LogWarning("Suspicious file name detected: {FileName}", fileName);
                return false;
            }
            
            // TODO: Integrate with actual malware scanning service
            // Example integration points:
            // - Windows Defender API
            // - ClamAV daemon
            // - Third-party antivirus APIs
            // - Cloud-based scanning services
            
            await Task.Delay(10); // Simulate scanning delay
            
            _logger.LogDebug("Malware scan completed successfully for: {FilePath}", filePath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Malware scan failed for file: {FilePath}", filePath);
            return false; // Fail-closed: reject file if scan fails
        }
    }

    private async Task SecureDeleteFileAsync(string filePath, int passes)
    {
        var fileInfo = new FileInfo(filePath);
        var fileSize = fileInfo.Length;
        
        // Perform multiple overwrite passes
        for (int pass = 0; pass < passes; pass++)
        {
            using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Write);
            
            // Generate random data for this pass
            var random = new Random();
            var buffer = new byte[4096];
            
            for (long position = 0; position < fileSize; position += buffer.Length)
            {
                var bytesToWrite = (int)Math.Min(buffer.Length, fileSize - position);
                random.NextBytes(buffer);
                await fileStream.WriteAsync(buffer, 0, bytesToWrite);
            }
            
            await fileStream.FlushAsync();
        }
        
        // Final pass with zeros
        using (var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Write))
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
    }

    private static bool IsValidFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        // Check for invalid characters
        var invalidChars = Path.GetInvalidFileNameChars();
        if (fileName.Any(c => invalidChars.Contains(c)))
            return false;

        // Check for reserved names (Windows)
        var reservedNames = new[]
        {
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
        };

        var nameWithoutExtension = Path.GetFileNameWithoutExtension(fileName).ToUpperInvariant();
        if (reservedNames.Contains(nameWithoutExtension))
            return false;

        // Check for suspicious patterns
        if (fileName.Contains("..") || fileName.StartsWith('.') || fileName.EndsWith('.'))
            return false;

        // Check for excessively long names
        if (fileName.Length > 255)
            return false;

        return true;
    }

    /// <summary>
    /// Handles file system errors with fail-closed behavior
    /// </summary>
    private async Task HandleFileSystemErrorAsync(string sessionId, Exception exception, string securityDescription)
    {
        try
        {
            _logger.LogError(exception, "File system error for session {SessionId}: {Description}", sessionId, securityDescription);

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
            await _securityManager.EnforceFailClosedAsync(sessionId, $"File system error: {exception.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle file system error for session {SessionId}", sessionId);
            // Don't throw - error handling should not cause additional failures
        }
    }
}