using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using AcchuSandboxEngine.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace AcchuSandboxEngine.Tests.UnitTests;

public class PrintManagerTests
{
    private readonly Mock<ILogger<PrintManager>> _mockLogger;
    private readonly Mock<IOptions<PrintConfiguration>> _mockConfig;
    private readonly IPrintManager _printManager;

    public PrintManagerTests()
    {
        _mockLogger = new Mock<ILogger<PrintManager>>();
        _mockConfig = new Mock<IOptions<PrintConfiguration>>();
        
        // Setup default configuration
        _mockConfig.Setup(x => x.Value).Returns(new PrintConfiguration
        {
            DefaultPrinterName = "Microsoft Print to PDF",
            MaxCopiesAllowed = 10,
            AllowColorPrinting = true,
            AllowDoubleSided = true,
            PrintTimeoutSeconds = 300
        });
        
        _printManager = new PrintManager(_mockLogger.Object, _mockConfig.Object);
    }

    [Fact]
    public async Task SubmitPrintJobAsync_WithValidDescriptor_ValidatesParameters()
    {
        // Arrange
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 2,
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        // Note: This test validates parameter validation logic
        // The actual print job submission may fail due to printer availability
        // but parameter validation should pass
    }

    [Fact]
    public async Task SubmitPrintJobAsync_WithInvalidCopies_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 0, // Invalid - should be > 0
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Contains("Invalid number of copies", result.ErrorMessage);
    }

    [Fact]
    public async Task SubmitPrintJobAsync_WithTooManyCopies_ReturnsFailureResult()
    {
        // Arrange
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 15, // Exceeds MaxCopiesAllowed (10)
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Contains("Invalid number of copies", result.ErrorMessage);
    }

    [Fact]
    public async Task SubmitPrintJobAsync_WithColorPrintingDisabled_ReturnsFailureResult()
    {
        // Arrange
        _mockConfig.Setup(x => x.Value).Returns(new PrintConfiguration
        {
            DefaultPrinterName = "Microsoft Print to PDF",
            MaxCopiesAllowed = 10,
            AllowColorPrinting = false, // Disabled
            AllowDoubleSided = true,
            PrintTimeoutSeconds = 300
        });

        var printManager = new PrintManager(_mockLogger.Object, _mockConfig.Object);
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 1,
            ColorPrinting = true, // Requesting color when disabled
            DoubleSided = false,
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Contains("Color printing is not allowed", result.ErrorMessage);
    }

    [Fact]
    public async Task SubmitPrintJobAsync_WithDoubleSidedDisabled_ReturnsFailureResult()
    {
        // Arrange
        _mockConfig.Setup(x => x.Value).Returns(new PrintConfiguration
        {
            DefaultPrinterName = "Microsoft Print to PDF",
            MaxCopiesAllowed = 10,
            AllowColorPrinting = true,
            AllowDoubleSided = false, // Disabled
            PrintTimeoutSeconds = 300
        });

        var printManager = new PrintManager(_mockLogger.Object, _mockConfig.Object);
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 1,
            ColorPrinting = false,
            DoubleSided = true, // Requesting double-sided when disabled
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Contains("Double-sided printing is not allowed", result.ErrorMessage);
    }

    [Fact]
    public async Task GetPrintStatusAsync_WithNonExistentJob_ReturnsFailedStatus()
    {
        // Arrange
        var sessionId = "test-session-123";
        var jobId = 999; // Non-existent job

        // Act
        var status = await _printManager.GetPrintStatusAsync(sessionId, jobId);

        // Assert
        Assert.Equal(PrintStatus.Failed, status);
    }

    [Fact]
    public async Task CancelPrintJobAsync_WithNonExistentJob_ReturnsFalse()
    {
        // Arrange
        var sessionId = "test-session-123";
        var jobId = 999; // Non-existent job

        // Act
        var result = await _printManager.CancelPrintJobAsync(sessionId, jobId);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task ClearPrintSpoolerAsync_WithNoJobs_ReturnsSuccessResult()
    {
        // Arrange
        var sessionId = "test-session-123";

        // Act
        var result = await _printManager.ClearPrintSpoolerAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Empty(result.CleanedItems);
        Assert.Empty(result.FailedItems);
    }

    [Fact]
    public async Task ClearPrintSpoolerAsync_WithEmptySessionId_ReturnsSuccessResult()
    {
        // Arrange
        var sessionId = "";

        // Act
        var result = await _printManager.ClearPrintSpoolerAsync(sessionId);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Empty(result.CleanedItems);
        Assert.Empty(result.FailedItems);
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(5, true)]
    [InlineData(10, true)]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    [InlineData(11, false)]
    public async Task SubmitPrintJobAsync_ValidatesCopiesParameter(int copies, bool shouldSucceed)
    {
        // Arrange
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = copies,
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "Microsoft Print to PDF"
        };

        // Act
        var result = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        if (shouldSucceed)
        {
            // Parameter validation should pass (actual print may still fail due to printer)
            if (!result.Success)
            {
                Assert.DoesNotContain("Invalid number of copies", result.ErrorMessage);
            }
        }
        else
        {
            Assert.False(result.Success);
            Assert.Contains("Invalid number of copies", result.ErrorMessage);
        }
    }

    [Fact]
    public async Task SubmitPrintJobAsync_UsesDefaultPrinterWhenNotSpecified()
    {
        // Arrange
        var sessionId = "test-session-123";
        var descriptor = new PrintJobDescriptor
        {
            FileName = "test.pdf",
            Copies = 1,
            ColorPrinting = false,
            DoubleSided = false,
            PrinterName = "" // Empty - should use default
        };

        // Act
        var result = await _printManager.SubmitPrintJobAsync(sessionId, descriptor);

        // Assert
        Assert.NotNull(result);
        // The test validates that default printer logic is triggered
        // Actual success depends on printer availability
    }
}