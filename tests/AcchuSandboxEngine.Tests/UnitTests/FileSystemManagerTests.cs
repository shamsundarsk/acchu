using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Xunit;

namespace AcchuSandboxEngine.Tests.UnitTests;

public class FileSystemManagerTests : IDisposable
{
    private readonly Mock<ILogger<FileSystemManager>> _mockLogger;
    private readonly SandboxConfiguration _config;
    private readonly FileSystemManager _fileSystemManager;
    private readonly List<string> _createdDirectories = new();
    private readonly List<string> _createdFiles = new();

    public FileSystemManagerTests()
    {
        _mockLogger = new Mock<ILogger<FileSystemManager>>();
        _config = new SandboxConfiguration
        {
            TempDirectoryRoot = Path.GetTempPath(),
            MaxFileSizeBytes = 1024 * 1024, // 1MB for testing
            AllowedFileTypes = new List<string> { ".txt", ".pdf", ".doc" },
            SecureDeletionPasses = 2 // Reduced for faster testing
        };

        var mockOptions = new Mock<IOptions<SandboxConfiguration>>();
        mockOptions.Setup(x => x.Value).Returns(_config);

        _fileSystemManager = new FileSystemManager(_mockLogger.Object, mockOptions.Object);
    }

    [Fact]
    public async Task CreateSandboxAsync_ShouldCreateUniqueDirectory()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();

        // Act
        var result = await _fileSystemManager.CreateSandboxAsync(sessionId);

        // Assert
        Assert.True(result.Success);
        Assert.NotEmpty(result.SandboxPath);
        Assert.True(Directory.Exists(result.SandboxPath));
        Assert.NotNull(result.ServiceSid);

        // Track for cleanup
        _createdDirectories.Add(result.SandboxPath);
    }

    [Fact]
    public async Task CreateSandboxAsync_ShouldCreateUniqueDirectoriesForDifferentSessions()
    {
        // Arrange
        var sessionId1 = Guid.NewGuid().ToString();
        var sessionId2 = Guid.NewGuid().ToString();

        // Act
        var result1 = await _fileSystemManager.CreateSandboxAsync(sessionId1);
        var result2 = await _fileSystemManager.CreateSandboxAsync(sessionId2);

        // Assert
        Assert.True(result1.Success);
        Assert.True(result2.Success);
        Assert.NotEqual(result1.SandboxPath, result2.SandboxPath);
        Assert.True(Directory.Exists(result1.SandboxPath));
        Assert.True(Directory.Exists(result2.SandboxPath));

        // Track for cleanup
        _createdDirectories.Add(result1.SandboxPath);
        _createdDirectories.Add(result2.SandboxPath);
    }

    [Fact]
    public async Task CreateSandboxAsync_ShouldApplyWindowsAcls()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();

        // Act
        var result = await _fileSystemManager.CreateSandboxAsync(sessionId);

        // Assert
        Assert.True(result.Success);
        
        // Verify ACLs are applied
        var directoryInfo = new DirectoryInfo(result.SandboxPath);
        var security = directoryInfo.GetAccessControl();
        var accessRules = security.GetAccessRules(true, true, typeof(SecurityIdentifier));
        
        // Should have at least service account and SYSTEM access
        Assert.True(accessRules.Count >= 2);

        // Track for cleanup
        _createdDirectories.Add(result.SandboxPath);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldStoreValidFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "test.txt";
        var fileContent = "This is a test file content";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.True(result.Success);
        Assert.NotEmpty(result.FilePath);
        Assert.True(File.Exists(result.FilePath));
        Assert.Equal(fileContent.Length, result.FileSize);
        Assert.NotEmpty(result.FileHash);

        // Verify file content
        var storedContent = await File.ReadAllTextAsync(result.FilePath);
        Assert.Equal(fileContent, storedContent);

        // Track for cleanup
        _createdFiles.Add(result.FilePath);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectOversizedFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "large.txt";
        var largeContent = new byte[_config.MaxFileSizeBytes + 1];
        var fileStream = new MemoryStream(largeContent);

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("exceeds maximum allowed size", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectDisallowedFileType()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "malicious.exe";
        var fileContent = "fake executable";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("is not allowed", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldFailForNonExistentSession()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "test.txt";
        var fileContent = "test content";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Act (without creating sandbox first)
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Sandbox not found", result.ErrorMessage);
    }

    [Fact]
    public async Task ValidateFileAsync_ShouldReturnTrueForValidFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "test.txt";
        var fileContent = "This is a valid text file";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox and store file
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);
        
        var storeResult = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);
        _createdFiles.Add(storeResult.FilePath);

        // Act
        var isValid = await _fileSystemManager.ValidateFileAsync(sessionId, fileName);

        // Assert
        Assert.True(isValid);
    }

    [Fact]
    public async Task ValidateFileAsync_ShouldReturnFalseForNonExistentFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "nonexistent.txt";

        // Create sandbox
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var isValid = await _fileSystemManager.ValidateFileAsync(sessionId, fileName);

        // Assert
        Assert.False(isValid);
    }

    [Fact]
    public async Task ValidateFileAsync_ShouldReturnFalseForExecutableFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "fake.txt";
        
        // Create fake executable with MZ header
        var executableContent = new byte[] { 0x4D, 0x5A, 0x90, 0x00 }; // MZ header
        var fileStream = new MemoryStream(executableContent);

        // Create sandbox and manually create file (bypassing type check)
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);
        
        var filePath = Path.Combine(sandboxResult.SandboxPath, fileName);
        await File.WriteAllBytesAsync(filePath, executableContent);
        _createdFiles.Add(filePath);

        // Act
        var isValid = await _fileSystemManager.ValidateFileAsync(sessionId, fileName);

        // Assert
        Assert.False(isValid);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectInvalidFileName()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "CON.txt"; // Reserved Windows name
        var fileContent = "test content";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Invalid file name", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectFileWithInvalidHeader()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "fake.pdf";
        var fakeContent = "This is not a PDF file"; // Invalid PDF content
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fakeContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("failed security validation", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldAcceptValidPdfFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "valid.pdf";
        
        // Create valid PDF header
        var pdfContent = new List<byte>();
        pdfContent.AddRange(Encoding.ASCII.GetBytes("%PDF-1.4"));
        pdfContent.AddRange(new byte[100]); // Add some padding
        var fileStream = new MemoryStream(pdfContent.ToArray());

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.True(result.Success);
        Assert.NotEmpty(result.FilePath);
        Assert.True(File.Exists(result.FilePath));

        // Track for cleanup
        _createdFiles.Add(result.FilePath);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectScriptContent()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "script.txt";
        var scriptContent = "#!/bin/bash\necho 'malicious script'"; // Script content
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(scriptContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("failed security validation", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectElfExecutable()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "fake.txt";
        
        // Create ELF executable header
        var elfContent = new byte[] { 0x7F, 0x45, 0x4C, 0x46 }; // ELF header
        var fileStream = new MemoryStream(elfContent);

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("failed security validation", result.ErrorMessage);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldAcceptValidJpegFile()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "image.jpg";
        
        // Create valid JPEG header
        var jpegContent = new List<byte>();
        jpegContent.AddRange(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }); // JPEG header
        jpegContent.AddRange(new byte[100]); // Add some padding
        var fileStream = new MemoryStream(jpegContent.ToArray());

        // Update config to allow JPEG files
        _config.AllowedFileTypes.Add(".jpg");

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.True(result.Success);
        Assert.NotEmpty(result.FilePath);
        Assert.True(File.Exists(result.FilePath));

        // Track for cleanup
        _createdFiles.Add(result.FilePath);
    }

    [Fact]
    public async Task StoreFileAsync_ShouldRejectSuspiciousFileName()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "virus.txt"; // Suspicious name
        var fileContent = "normal content";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox first
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        _createdDirectories.Add(sandboxResult.SandboxPath);

        // Act
        var result = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Assert
        Assert.False(result.Success);
        Assert.Contains("failed security validation", result.ErrorMessage);
    }

    [Fact]
    public async Task SecureDeleteAsync_ShouldDeleteSandboxAndFiles()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "test.txt";
        var fileContent = "test content for deletion";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox and store file
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        var storeResult = await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Verify file exists before deletion
        Assert.True(File.Exists(storeResult.FilePath));
        Assert.True(Directory.Exists(sandboxResult.SandboxPath));

        // Act
        var deleteResult = await _fileSystemManager.SecureDeleteAsync(sessionId);

        // Assert
        Assert.True(deleteResult.Success);
        Assert.Equal(_config.SecureDeletionPasses, deleteResult.OverwritePasses);
        Assert.Contains(storeResult.FilePath, deleteResult.CleanedItems);
        Assert.Contains(sandboxResult.SandboxPath, deleteResult.CleanedItems);
        Assert.Empty(deleteResult.FailedItems);

        // Verify files and directory are deleted
        Assert.False(File.Exists(storeResult.FilePath));
        Assert.False(Directory.Exists(sandboxResult.SandboxPath));
    }

    [Fact]
    public async Task SecureDeleteAsync_ShouldSucceedForNonExistentSession()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();

        // Act
        var result = await _fileSystemManager.SecureDeleteAsync(sessionId);

        // Assert
        Assert.True(result.Success);
        Assert.Empty(result.CleanedItems);
        Assert.Empty(result.FailedItems);
    }

    [Fact]
    public async Task VerifyCleanupAsync_ShouldReturnTrueAfterSuccessfulCleanup()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var fileName = "test.txt";
        var fileContent = "test content";
        var fileStream = new MemoryStream(Encoding.UTF8.GetBytes(fileContent));

        // Create sandbox and store file
        var sandboxResult = await _fileSystemManager.CreateSandboxAsync(sessionId);
        await _fileSystemManager.StoreFileAsync(sessionId, fileStream, fileName);

        // Perform cleanup
        await _fileSystemManager.SecureDeleteAsync(sessionId);

        // Act
        var isCleanedUp = await _fileSystemManager.VerifyCleanupAsync(sessionId);

        // Assert
        Assert.True(isCleanedUp);
    }

    [Fact]
    public async Task VerifyCleanupAsync_ShouldReturnTrueForNonExistentSession()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();

        // Act
        var isCleanedUp = await _fileSystemManager.VerifyCleanupAsync(sessionId);

        // Assert
        Assert.True(isCleanedUp);
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