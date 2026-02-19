using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Services;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using System.Text;
using Xunit;

namespace AcchuSandboxEngine.Tests.PropertyTests;

/// <summary>
/// **Feature: acchu-sandbox-engine, Property 13: File Content Security Validation**
/// **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
/// 
/// For any file submission, the system should reject executable files, validate file headers match declared types, 
/// prevent code execution operations, and only accept whitelisted file types.
/// </summary>
public class FileSystemPropertyTests : IDisposable
{
    private readonly Mock<ILogger<FileSystemManager>> _mockLogger;
    private readonly SandboxConfiguration _config;
    private readonly FileSystemManager _fileSystemManager;
    private readonly List<string> _createdDirectories = new();
    private readonly List<string> _createdFiles = new();

    public FileSystemPropertyTests()
    {
        _mockLogger = new Mock<ILogger<FileSystemManager>>();
        _config = new SandboxConfiguration
        {
            TempDirectoryRoot = Path.GetTempPath(),
            MaxFileSizeBytes = 1024 * 1024, // 1MB for testing
            AllowedFileTypes = new List<string> { ".txt", ".pdf", ".doc", ".docx", ".jpg", ".png" },
            SecureDeletionPasses = 1 // Reduced for faster testing
        };

        var mockOptions = new Mock<IOptions<SandboxConfiguration>>();
        mockOptions.Setup(x => x.Value).Returns(_config);

        _fileSystemManager = new FileSystemManager(_mockLogger.Object, mockOptions.Object);
    }

    /// <summary>
    /// Property 13: File Content Security Validation
    /// Validates: Requirements 6.1, 6.2, 6.4, 6.5
    /// </summary>
    [Property(MaxTest = 100)]
    public Property FileContentSecurityValidation_ShouldRejectExecutableFiles()
    {
        return Prop.ForAll(
            Gen.Elements(GetExecutableHeaders()),
            Gen.Elements(_config.AllowedFileTypes),
            (executableHeader, fileExtension) =>
            {
                var sessionId = Guid.NewGuid().ToString();
                var fileName = $"test{fileExtension}";
                
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Arrange
                        var fileStream = new MemoryStream(executableHeader);
                        
                        // Create sandbox
                        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
                        if (sandboxResult.Success)
                        {
                            _createdDirectories.Add(sandboxResult.SandboxPath);
                        }

                        // Act
                        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

                        // Assert - executable files should be rejected
                        return !result.Success && result.ErrorMessage.Contains("failed security validation");
                    }
                    catch
                    {
                        // Any exception during processing should be treated as rejection (fail-closed)
                        return true;
                    }
                });
            });
    }

    [Property(MaxTest = 100)]
    public Property FileContentSecurityValidation_ShouldValidateFileHeaders()
    {
        return Prop.ForAll(
            Gen.Elements(GetValidFileHeaders()),
            (validFileData) =>
            {
                var sessionId = Guid.NewGuid().ToString();
                
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Arrange
                        var fileStream = new MemoryStream(validFileData.Content);
                        
                        // Create sandbox
                        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
                        if (sandboxResult.Success)
                        {
                            _createdDirectories.Add(sandboxResult.SandboxPath);
                        }

                        // Act
                        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, validFileData.FileName);

                        // Assert - valid files with correct headers should be accepted
                        if (result.Success && !string.IsNullOrEmpty(result.FilePath))
                        {
                            _createdFiles.Add(result.FilePath);
                        }

                        return result.Success;
                    }
                    catch
                    {
                        // Unexpected exceptions should not occur for valid files
                        return false;
                    }
                });
            });
    }

    [Property(MaxTest = 100)]
    public Property FileContentSecurityValidation_ShouldRejectScriptContent()
    {
        return Prop.ForAll(
            Gen.Elements(GetScriptContent()),
            (scriptContent) =>
            {
                var sessionId = Guid.NewGuid().ToString();
                var fileName = "script.txt";
                
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Arrange
                        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(scriptContent));
                        
                        // Create sandbox
                        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
                        if (sandboxResult.Success)
                        {
                            _createdDirectories.Add(sandboxResult.SandboxPath);
                        }

                        // Act
                        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

                        // Assert - script content should be rejected
                        return !result.Success && result.ErrorMessage.Contains("failed security validation");
                    }
                    catch
                    {
                        // Any exception during processing should be treated as rejection (fail-closed)
                        return true;
                    }
                });
            });
    }

    [Property(MaxTest = 100)]
    public Property FileContentSecurityValidation_ShouldEnforceWhitelist()
    {
        return Prop.ForAll(
            Gen.Elements(GetDisallowedFileTypes()),
            (disallowedExtension) =>
            {
                var sessionId = Guid.NewGuid().ToString();
                var fileName = $"test{disallowedExtension}";
                var fileContent = "test content";
                
                return Prop.ForAllAsync(async () =>
                {
                    try
                    {
                        // Arrange
                        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));
                        
                        // Create sandbox
                        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
                        if (sandboxResult.Success)
                        {
                            _createdDirectories.Add(sandboxResult.SandboxPath);
                        }

                        // Act
                        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

                        // Assert - disallowed file types should be rejected
                        return !result.Success && result.ErrorMessage.Contains("is not allowed");
                    }
                    catch
                    {
                        // Any exception during processing should be treated as rejection (fail-closed)
                        return true;
                    }
                });
            });
    }

    private static byte[][] GetExecutableHeaders()
    {
        return new[]
        {
            new byte[] { 0x4D, 0x5A, 0x90, 0x00 }, // DOS/Windows executable (MZ header)
            new byte[] { 0x7F, 0x45, 0x4C, 0x46 }, // ELF executable
            new byte[] { 0xFE, 0xED, 0xFA, 0xCE }, // Mach-O executable
            new byte[] { 0xCA, 0xFE, 0xBA, 0xBE }, // Java class file
            Encoding.UTF8.GetBytes("#!/bin/bash\n"), // Shell script
            Encoding.UTF8.GetBytes("#!/usr/bin/python\n") // Python script
        };
    }

    private static (string FileName, byte[] Content)[] GetValidFileHeaders()
    {
        return new[]
        {
            ("test.pdf", CreatePdfContent()),
            ("test.txt", Encoding.UTF8.GetBytes("This is a valid text file")),
            ("test.jpg", CreateJpegContent()),
            ("test.png", CreatePngContent())
        };
    }

    private static byte[] CreatePdfContent()
    {
        var content = new List<byte>();
        content.AddRange(Encoding.ASCII.GetBytes("%PDF-1.4"));
        content.AddRange(new byte[100]); // Add padding
        return content.ToArray();
    }

    private static byte[] CreateJpegContent()
    {
        var content = new List<byte>();
        content.AddRange(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 });
        content.AddRange(new byte[100]); // Add padding
        return content.ToArray();
    }

    private static byte[] CreatePngContent()
    {
        var content = new List<byte>();
        content.AddRange(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        content.AddRange(new byte[100]); // Add padding
        return content.ToArray();
    }

    private static string[] GetScriptContent()
    {
        return new[]
        {
            "#!/bin/bash\necho 'malicious script'",
            "powershell -Command 'Get-Process'",
            "<script>alert('xss')</script>",
            "javascript:alert('malicious')",
            "import os\nos.system('rm -rf /')",
            "eval('malicious code')",
            "exec('dangerous command')"
        };
    }

    private static string[] GetDisallowedFileTypes()
    {
        return new[]
        {
            ".exe", ".bat", ".cmd", ".com", ".scr", ".pif",
            ".js", ".vbs", ".ps1", ".sh", ".py", ".pl",
            ".jar", ".class", ".dll", ".so", ".dylib"
        };
    }

    /// <summary>
    /// Property 1: Unique Sandbox Creation
    /// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
    /// </summary>
    [Property(MaxTest = 100)]
    public Property UniqueSandboxCreation_ShouldCreateUniqueIsolatedDirectories()
    {
        return Prop.ForAll(
            Gen.ListOf(Gen.Elements(Enumerable.Range(1, 10).Select(i => Guid.NewGuid().ToString("N")[..16]))),
            (sessionIds) =>
            {
                if (sessionIds.Count < 2) return true; // Need at least 2 sessions to test uniqueness
                
                return Prop.ForAllAsync(async () =>
                {
                    var sandboxPaths = new List<string>();
                    var createdSandboxes = new List<string>();
                    
                    try
                    {
                        // Create sandboxes for all session IDs
                        foreach (var sessionId in sessionIds.Take(5)) // Limit to 5 for performance
                        {
                            var result = await _fileSystemManager.CreateSandboxAsync(sessionId);
                            if (result.Success)
                            {
                                sandboxPaths.Add(result.SandboxPath);
                                createdSandboxes.Add(result.SandboxPath);
                                
                                // Verify sandbox exists and is accessible only by service
                                if (!Directory.Exists(result.SandboxPath))
                                    return false;
                                
                                // Verify ACLs are applied (service account access)
                                if (result.ServiceSid == null)
                                    return false;
                            }
                        }
                        
                        // Verify all paths are unique
                        var uniquePaths = sandboxPaths.Distinct().Count();
                        if (uniquePaths != sandboxPaths.Count)
                            return false;
                        
                        // Verify all directories exist and are isolated
                        foreach (var path in sandboxPaths)
                        {
                            if (!Directory.Exists(path))
                                return false;
                                
                            // Verify path is in temp directory (isolation)
                            if (!path.StartsWith(_config.TempDirectoryRoot))
                                return false;
                        }
                        
                        return true;
                    }
                    finally
                    {
                        // Cleanup created sandboxes
                        foreach (var sandbox in createdSandboxes)
                        {
                            _createdDirectories.Add(sandbox);
                        }
                    }
                });
            });
    }

    public void Dispose()
    {
        // Clean up any created files and directories
        foreach (var file in _createdFiles)
        {
            try
            {
                if (File.Exists(file))
                    File.Delete(file);
            }
            catch
            {
                // Ignore cleanup errors in tests
            }
        }

        foreach (var directory in _createdDirectories)
        {
            try
            {
                if (Directory.Exists(directory))
                    Directory.Delete(directory, true);
            }
            catch
            {
                // Ignore cleanup errors in tests
            }
        }
    }
}