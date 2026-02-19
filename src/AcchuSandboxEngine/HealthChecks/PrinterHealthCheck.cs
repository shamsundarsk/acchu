using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AcchuSandboxEngine.Configuration;
using System.Drawing.Printing;

namespace AcchuSandboxEngine;

/// <summary>
/// Health check for printer availability and status
/// </summary>
public class PrinterHealthCheck : IHealthCheck
{
    private readonly ILogger<PrinterHealthCheck> _logger;
    private readonly PrintConfiguration _printConfig;

    public PrinterHealthCheck(
        ILogger<PrinterHealthCheck> logger,
        IOptions<PrintConfiguration> printConfig)
    {
        _logger = logger;
        _printConfig = printConfig.Value;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var healthData = new Dictionary<string, object>();

            // Get installed printers
            var installedPrinters = new List<string>();
            foreach (string printerName in PrinterSettings.InstalledPrinters)
            {
                installedPrinters.Add(printerName);
            }

            healthData.Add("InstalledPrinters", installedPrinters);
            healthData.Add("InstalledPrinterCount", installedPrinters.Count);

            // Check if any printers are available
            if (installedPrinters.Count == 0)
            {
                return Task.FromResult(HealthCheckResult.Unhealthy(
                    "No printers are installed on the system", 
                    null,
                    healthData));
            }

            // Check default printer configuration
            var defaultPrinter = _printConfig.DefaultPrinterName;
            healthData.Add("ConfiguredDefaultPrinter", defaultPrinter);

            if (!string.IsNullOrEmpty(defaultPrinter))
            {
                var defaultPrinterAvailable = installedPrinters.Contains(defaultPrinter, StringComparer.OrdinalIgnoreCase);
                healthData.Add("DefaultPrinterAvailable", defaultPrinterAvailable);

                if (!defaultPrinterAvailable)
                {
                    return Task.FromResult(HealthCheckResult.Degraded(
                        $"Configured default printer '{defaultPrinter}' is not available. Available printers: {string.Join(", ", installedPrinters)}", 
                        null,
                        healthData));
                }

                // Try to get printer status for the default printer
                try
                {
                    var printerSettings = new PrinterSettings();
                    printerSettings.PrinterName = defaultPrinter;
                    
                    healthData.Add("DefaultPrinterValid", printerSettings.IsValid);
                    healthData.Add("DefaultPrinterCanDuplex", printerSettings.CanDuplex);
                    healthData.Add("DefaultPrinterSupportsColor", printerSettings.SupportsColor);

                    if (!printerSettings.IsValid)
                    {
                        return Task.FromResult(HealthCheckResult.Degraded(
                            $"Default printer '{defaultPrinter}' is not in a valid state", 
                            null,
                            healthData));
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to get detailed status for default printer {PrinterName}", defaultPrinter);
                    healthData.Add("DefaultPrinterStatusError", ex.Message);
                }
            }
            else
            {
                // No default printer configured, use system default
                try
                {
                    var defaultSettings = new PrinterSettings();
                    var systemDefaultPrinter = defaultSettings.PrinterName;
                    healthData.Add("SystemDefaultPrinter", systemDefaultPrinter);
                    healthData.Add("SystemDefaultPrinterValid", defaultSettings.IsValid);

                    if (string.IsNullOrEmpty(systemDefaultPrinter))
                    {
                        return Task.FromResult(HealthCheckResult.Degraded(
                            "No default printer is configured in the system", 
                            null,
                            healthData));
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to get system default printer information");
                    healthData.Add("SystemDefaultPrinterError", ex.Message);
                }
            }

            // Check print spooler service status
            try
            {
                using var spoolerService = new System.ServiceProcess.ServiceController("Spooler");
                var spoolerStatus = spoolerService.Status.ToString();
                healthData.Add("PrintSpoolerStatus", spoolerStatus);

                if (spoolerService.Status != System.ServiceProcess.ServiceControllerStatus.Running)
                {
                    return Task.FromResult(HealthCheckResult.Unhealthy(
                        $"Print Spooler service is not running. Status: {spoolerStatus}", 
                        null,
                        healthData));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to check Print Spooler service status");
                healthData.Add("PrintSpoolerStatusError", ex.Message);
                
                return Task.FromResult(HealthCheckResult.Degraded(
                    "Unable to verify Print Spooler service status", 
                    null,
                    healthData));
            }

            return Task.FromResult(HealthCheckResult.Healthy(
                $"Printing system is healthy. {installedPrinters.Count} printer(s) available", 
                healthData));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Printer health check failed");
            return Task.FromResult(HealthCheckResult.Unhealthy("Failed to check printer status", ex));
        }
    }
}