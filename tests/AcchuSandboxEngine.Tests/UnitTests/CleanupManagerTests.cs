using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace AcchuSandboxEngine.Tests.UnitTests;

public class CleanupManagerTests : IDisposable
{
    private readonly Mock<ILogger<CleanupManager>> _mockLogger;
    private readonly Mock<IOptions<SandboxConfiguration>> _mockConfig;
    private readonly Mock<ISessionManager> _mockSessionManager;
    private readonly Mock<IFileSystemManager> _mockFileSystemManager;
    private readonly CleanupManager _cleanupManager;
    private readonly SandboxConfiguration _config;
    private readonly List<string> _createdFiles = new();
    private readonly List<string> _createdDirectories = new();

    public CleanupManagerTests()
    {
        _mockLogger = new Mock<ILogger<CleanupManager>>();
        _mockConfig = new Mock<IOptions<SandboxConfiguration>>();
        _mockSessionManager = new Mock<ISessionManager>();
        _mockFileSystemManager = new Mock<IFileSystemManager>();

        _config = new SandboxConfiguration
        {
            TempDirectoryRoot = Path.GetTempPath(),
            SecureDeletionPasses = 3,
            MaxSessionDurationMinutes = 60,
            EnableAuditLogging = true
        };

        _mockConfig.Setup(x => x.Value).Returns(_config);

        _cleanupManager = new CleanupManager(
            _mockLogger.Object,
            _mockConfig.Object,
            _mockSessionManager.Object,
            _mockFileSystemManager.Object);
    }

    [Fact]
    public async Task PerformFullCleanupAsync_WithValidSession_ShouldExecuteAllCleanupSteps()
    {
        // Arrange
        var sessionId = "test-session-123";
        
        _mockFileSystemManager.Setup(x => x.SecureDeleteAsync(sessionId))
            .ReturnsAsync(new CleanupResult
            {
                Success = true,
                CleanedItems = new List<string> { "file1.txt", "file2.pdf" },
                OverwritePasses = 3
            });

        // Act
        var result = await _cleanupManager.PerformFullCleanupAsync(sessionId);

        // Assert
        Assert.True(result.Success);
        Assert.Equal(3, result.OverwritePasses);
        Assert.Contains("Session token invalidated: test-session-123", result.CleanedItems);
        
        // Verify all cleanup steps were called
        _mockFileSystemManager.Verify(x => x.SecureDeleteAsync(sessionId), Times.Once);
        _mockSessionManager.Verify(x => x.InvalidateSessionAsync(sessionId, "Full cleanup completed"), Times.Once);
    }

    [Fact]
    public async Task PerformFullCleanupAsync_WithFileSystemFailure_ShouldContinueWithOtherSteps()
    {
        // Arrange
        var sessionId = "test-session-456";
        
        _mockFileSystemManager.Setup(x => x.SecureDeleteAsync(sessionId))
            .ReturnsAsync(new CleanupResult
            {
                Success = false,
                ErrorMessage = "File system error",
                FailedItems = new List<string> { "locked-file.txt" }
            });

        // Act
        var result = await _cleanupManager.PerformFullCleanupAsync(sessionId);

        // Assert
        Assert.False(result.Success); // Overall failure due to file system failure
        Assert.Contains("locked-file.txt", result.FailedItems);
        Assert.Contains("Session token invalidated: test-session-456", result.CleanedItems);
        
        // Verify session was still invalidated despite file system failure
        _mockSessionManager.Verify(x => x.InvalidateSessionAsync(sessionId, "Full cleanup completed"), Times.Once);
    }

    [Fact]
    public async Task SecureDeleteFilesAsync_WithNonExistentPath_ShouldReturnSuccess()
    {
        // Arrange
        var nonExistentPath = Path.Combine(Path.GetTempPath(), "non-existent-sandbox-" + Guid.NewGuid());

        // Act
        var result = await _cleanupManager.SecureDeleteFilesAsync(nonExistentPath);

        // Assert
        Assert.True(result.Success);
        Assert.Equal(3, result.OverwritePasses);
    }

    [Fact]
    public async Task SecureDeleteFilesAsync_WithValidPath_ShouldDeleteFilesSecurely()
    {
        // Arrange
        var testDir = Path.Combine(Path.GetTempPath(), "test-sandbox-" + Guid.NewGuid());
        Directory.CreateDirectory(testDir);
        _createdDirectories.Add(testDir);

        var testFile = Path.Combine(testDir, "test-file.txt");
        await File.WriteAllTextAsync(testFile, "Test content for secure deletion");
        _createdFiles.Add(testFile);

        // Act
        var result = await _cleanupManager.SecureDeleteFilesAsync(testDir);

        // Assert
        Assert.True(result.Success);
        Assert.Equal(3, result.OverwritePasses);
        Assert.Contains(testFile, result.CleanedItems);
        Assert.False(File.Exists(testFile));
        Assert.False(Directory.Exists(testDir));
    }

    [Fact]
    public async Task ClearPrintSpoolerAsync_ShouldCompleteWithoutErrors()
    {
        // Arrange
        var sessionId = "test-session-789";

        // Act
        var result = await _cleanupManager.ClearPrintSpoolerAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        // Note: This test mainly verifies the method doesn't throw exceptions
        // Actual print spooler interaction would require integration testing
    }

    [Fact]
    public async Task ClearTemporaryCachesAsync_ShouldCompleteWithoutErrors()
    {
        // Arrange
        var sessionId = "test-session-cache";

        // Act
        var result = await _cleanupManager.ClearTemporaryCachesAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        // Note: This test mainly verifies the method doesn't throw exceptions
        // Actual cache cleanup would require integration testing with real cache files
    }

    [Fact]
    public async Task VerifyNoDataResidueAsync_WithCleanSession_ShouldReturnTrue()
    {
        // Arrange
        var sessionId = "clean-session-" + Guid.NewGuid();
        
        _mockSessionManager.Setup(x => x.GetSessionStatus(sessionId))
            .Returns(SessionStatus.Invalidated);

        // Act
        var result = await _cleanupManager.VerifyNoDataResidueAsync(sessionId);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task VerifyNoDataResidueAsync_WithActiveSession_ShouldReturnFalse()
    {
        // Arrange
        var sessionId = "active-session-" + Guid.NewGuid();
        
        _mockSessionManager.Setup(x => x.GetSessionStatus(sessionId))
            .Returns(SessionStatus.Active);

        // Act
        var result = await _cleanupManager.VerifyNoDataResidueAsync(sessionId);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task VerifyNoDataResidueAsync_WithRemainingSandboxDirectory_ShouldReturnFalse()
    {
        // Arrange
        var sessionId = Guid.NewGuid().ToString();
        var sandboxDir = Path.Combine(_config.TempDirectoryRoot, $"acchu_sandbox_{sessionId}_test");
        
        Directory.CreateDirectory(sandboxDir);
        _createdDirectories.Add(sandboxDir);
        
        _mockSessionManager.Setup(x => x.GetSessionStatus(sessionId))
            .Returns(SessionStatus.Invalidated);

        // Act
        var result = await _cleanupManager.VerifyNoDataResidueAsync(sessionId);

        // Assert
        Assert.False(result);
    }

    public void Dispose()
    {
        // Clean up test files and directories
        foreach (var file in _createdFiles)
        {
            try
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
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
                {
                    Directory.Delete(directory, true);
                }
            }
            catch
            {
                // Ignore cleanup errors in tests
            }
        }
    }
}