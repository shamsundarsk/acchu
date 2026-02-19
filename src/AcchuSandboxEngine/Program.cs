using AcchuSandboxEngine.Configuration;
using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Services;
using AcchuSandboxEngine.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Diagnostics;
using Serilog;
using Serilog.Events;
using Serilog.Extensions.Hosting;

namespace AcchuSandboxEngine;

public class Program
{
    public static async Task Main(string[] args)
    {
        // Handle service installation/uninstallation arguments
        if (args.Length > 0)
        {
            var command = args[0].ToLowerInvariant();
            switch (command)
            {
                case "install":
                    await InstallServiceAsync();
                    return;
                case "uninstall":
                    await UninstallServiceAsync();
                    return;
                case "start":
                    await StartServiceAsync();
                    return;
                case "stop":
                    await StopServiceAsync();
                    return;
                case "--validate-config":
                case "-v":
                    await ValidateConfigurationAsync(args);
                    return;
                case "--help":
                case "-h":
                    ShowHelp();
                    return;
            }
        }

        var builder = Host.CreateApplicationBuilder(args);

        // Configure Windows Service with enhanced options
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "AcchuSandboxEngine";
        });

        // Configure enhanced logging with structured logging
        builder.Services.AddLogging(logging =>
        {
            logging.ClearProviders();
            logging.AddConsole(options =>
            {
                options.IncludeScopes = true;
                options.TimestampFormat = "yyyy-MM-dd HH:mm:ss ";
            });
            
            // Add Windows Event Log with custom source
            logging.AddEventLog(options =>
            {
                options.SourceName = "ACCHU Sandbox Engine";
                options.LogName = "Application";
            });
        });

        // Configure Serilog for file logging
        builder.Services.AddSerilog((services, lc) => lc
            .WriteTo.File(
                Path.Combine(Environment.ExpandEnvironmentVariables("%TEMP%"), "AcchuSandbox", "Logs", "service-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 30,
                shared: true,
                flushToDiskInterval: TimeSpan.FromSeconds(1))
            .WriteTo.Console()
            .Enrich.FromLogContext());

        // Configure configuration sections
        builder.Services.Configure<SandboxConfiguration>(
            builder.Configuration.GetSection(SandboxConfiguration.SectionName));
        builder.Services.Configure<PrintConfiguration>(
            builder.Configuration.GetSection(PrintConfiguration.SectionName));
        builder.Services.Configure<SecurityConfiguration>(
            builder.Configuration.GetSection(SecurityConfiguration.SectionName));

        // Add health checks for system monitoring (simplified for demo)
        builder.Services.AddHealthChecks();
            // .AddCheck<ServiceHealthCheck>("service_health")
            // .AddCheck<DiskSpaceHealthCheck>("disk_space")
            // .AddCheck<PrinterHealthCheck>("printer_status");

        // Configure SignalR for real-time communication
        builder.Services.AddSignalR(options =>
        {
            options.EnableDetailedErrors = true;
            options.KeepAliveInterval = TimeSpan.FromSeconds(15);
            options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
        });

        // Configure CORS for web and mobile integration
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("IntegrationPolicy", policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        // Configure integration settings
        builder.Services.Configure<AcchuSandboxEngine.Api.Models.IntegrationConfig>(options =>
        {
            options.ApiBaseUrl = "http://localhost:5000";
            options.SessionTimeoutMinutes = 60;
            options.MaxFileSize = 100 * 1024 * 1024; // 100MB
            options.AllowedFileTypes = new List<string> { ".pdf", ".doc", ".docx", ".jpg", ".png", ".txt" };
            options.Pricing = new AcchuSandboxEngine.Api.Models.PricingConfig
            {
                BlackWhitePerPage = 2.0m,
                ColorPerPage = 6.0m,
                DuplexDiscount = 0.2m,
                ServiceFee = 1.0m
            };
        });

        // Register core services with proper dependency injection order
        builder.Services.AddSingleton<ISecurityManager, SecurityManager>();
        builder.Services.AddSingleton<IFileSystemManager, FileSystemManager>();
        builder.Services.AddSingleton<IPrintManager, PrintManager>();
        
        // Register diagnostics service
        builder.Services.AddSingleton<DiagnosticsService>();
        
        // Register session manager first (without monitoring service dependency)
        builder.Services.AddSingleton<ISessionManager, SessionManager>();
        
        // Register cleanup manager after session manager
        builder.Services.AddSingleton<ICleanupManager, CleanupManager>();
        
        // Register monitoring service as hosted service only (temporarily disabled for demo)
        // builder.Services.AddHostedService<MonitoringService>();

        // Register health check services (temporarily disabled for demo)
        // builder.Services.AddSingleton<ServiceHealthCheck>();
        // builder.Services.AddSingleton<DiskSpaceHealthCheck>();
        // builder.Services.AddSingleton<PrinterHealthCheck>();

        // Register configuration validation service
        builder.Services.AddSingleton<ConfigurationValidationService>();

        // Register the main worker service (temporarily disabled for demo)
        // builder.Services.AddHostedService<AcchuSandboxWorker>();

        // Register the API host service
        builder.Services.AddHostedService<Api.ApiHostService>();

        // Configure graceful shutdown timeout
        builder.Services.Configure<HostOptions>(options =>
        {
            options.ShutdownTimeout = TimeSpan.FromSeconds(30);
        });

        var host = builder.Build();

        // Configure unhandled exception handling
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            var logger = host.Services.GetService<ILogger<Program>>();
            logger?.LogCritical(e.ExceptionObject as Exception, 
                "Unhandled exception occurred. Service will terminate.");
        };

        TaskScheduler.UnobservedTaskException += (sender, e) =>
        {
            var logger = host.Services.GetService<ILogger<Program>>();
            logger?.LogError(e.Exception, "Unobserved task exception occurred");
            e.SetObserved(); // Prevent process termination
        };

        try
        {
            await host.RunAsync();
        }
        catch (Exception ex)
        {
            // Log to console since service provider may be disposed
            Console.WriteLine($"Critical error occurred during service execution: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Installs the Windows service
    /// </summary>
    private static async Task InstallServiceAsync()
    {
        try
        {
            Console.WriteLine("Installing ACCHU Sandbox Engine service...");
            
            var exePath = Process.GetCurrentProcess().MainModule?.FileName ?? 
                         System.Reflection.Assembly.GetExecutingAssembly().Location;
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = $"create AcchuSandboxEngine binPath= \"{exePath}\" start= auto DisplayName= \"ACCHU Sandbox Engine\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                await process.WaitForExitAsync();
                if (process.ExitCode == 0)
                {
                    Console.WriteLine("Service installed successfully.");
                    
                    // Configure service recovery
                    await ConfigureServiceRecoveryAsync();
                }
                else
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    Console.WriteLine($"Failed to install service: {error}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error installing service: {ex.Message}");
        }
    }

    /// <summary>
    /// Uninstalls the Windows service
    /// </summary>
    private static async Task UninstallServiceAsync()
    {
        try
        {
            Console.WriteLine("Uninstalling ACCHU Sandbox Engine service...");
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "delete AcchuSandboxEngine",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                await process.WaitForExitAsync();
                if (process.ExitCode == 0)
                {
                    Console.WriteLine("Service uninstalled successfully.");
                }
                else
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    Console.WriteLine($"Failed to uninstall service: {error}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error uninstalling service: {ex.Message}");
        }
    }

    /// <summary>
    /// Starts the Windows service
    /// </summary>
    private static async Task StartServiceAsync()
    {
        try
        {
            Console.WriteLine("Starting ACCHU Sandbox Engine service...");
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "start AcchuSandboxEngine",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                await process.WaitForExitAsync();
                if (process.ExitCode == 0)
                {
                    Console.WriteLine("Service started successfully.");
                }
                else
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    Console.WriteLine($"Failed to start service: {error}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error starting service: {ex.Message}");
        }
    }

    /// <summary>
    /// Stops the Windows service
    /// </summary>
    private static async Task StopServiceAsync()
    {
        try
        {
            Console.WriteLine("Stopping ACCHU Sandbox Engine service...");
            
            var processInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "stop AcchuSandboxEngine",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                await process.WaitForExitAsync();
                if (process.ExitCode == 0)
                {
                    Console.WriteLine("Service stopped successfully.");
                }
                else
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    Console.WriteLine($"Failed to stop service: {error}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error stopping service: {ex.Message}");
        }
    }

    /// <summary>
    /// Configures service recovery and restart policies
    /// </summary>
    private static async Task ConfigureServiceRecoveryAsync()
    {
        try
        {
            Console.WriteLine("Configuring service recovery options...");
            
            // Configure service to restart on failure
            var processInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "failure AcchuSandboxEngine reset= 86400 actions= restart/60000/restart/120000/restart/300000",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                await process.WaitForExitAsync();
                if (process.ExitCode == 0)
                {
                    Console.WriteLine("Service recovery options configured successfully.");
                }
                else
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    Console.WriteLine($"Warning: Failed to configure service recovery: {error}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Error configuring service recovery: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates configuration without starting the service
    /// </summary>
    private static async Task ValidateConfigurationAsync(string[] args)
    {
        try
        {
            Console.WriteLine("ACCHU Sandbox Engine - Configuration Validation");
            Console.WriteLine("===============================================");
            Console.WriteLine();

            // Build minimal configuration for validation
            var builder = Host.CreateApplicationBuilder(args);
            
            // Configure configuration sections
            builder.Services.Configure<SandboxConfiguration>(
                builder.Configuration.GetSection(SandboxConfiguration.SectionName));
            builder.Services.Configure<PrintConfiguration>(
                builder.Configuration.GetSection(PrintConfiguration.SectionName));
            builder.Services.Configure<SecurityConfiguration>(
                builder.Configuration.GetSection(SecurityConfiguration.SectionName));

            // Add logging for validation
            builder.Services.AddLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddConsole();
            });

            // Register validation service
            builder.Services.AddSingleton<ConfigurationValidationService>();

            var host = builder.Build();
            var validationService = host.Services.GetRequiredService<ConfigurationValidationService>();

            // Run validation
            var result = await validationService.ValidateConfigurationAsync();

            // Display results
            if (result.Info.Any())
            {
                Console.WriteLine("Information:");
                foreach (var info in result.Info)
                {
                    Console.WriteLine($"  [INFO] {info.Section}: {info.Message}");
                }
                Console.WriteLine();
            }

            if (result.Warnings.Any())
            {
                Console.WriteLine("Warnings:");
                foreach (var warning in result.Warnings)
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine($"  [WARN] {warning.Section}: {warning.Message}");
                    Console.ResetColor();
                }
                Console.WriteLine();
            }

            if (result.Errors.Any())
            {
                Console.WriteLine("Errors:");
                foreach (var error in result.Errors)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [ERROR] {error.Section}: {error.Message}");
                    Console.ResetColor();
                }
                Console.WriteLine();
            }

            // Summary
            if (result.IsValid)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("✓ Configuration validation PASSED");
                Console.ResetColor();
                
                if (result.Warnings.Any())
                {
                    Console.WriteLine($"  {result.Warnings.Count} warning(s) found - review recommended");
                }
                
                Environment.Exit(0);
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("✗ Configuration validation FAILED");
                Console.ResetColor();
                Console.WriteLine($"  {result.Errors.Count} error(s) must be fixed before deployment");
                
                Environment.Exit(1);
            }
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"Configuration validation failed with exception: {ex.Message}");
            Console.ResetColor();
            Environment.Exit(1);
        }
    }

    /// <summary>
    /// Shows help information
    /// </summary>
    private static void ShowHelp()
    {
        Console.WriteLine("ACCHU Sandbox Engine - Secure Document Processing Service");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  AcchuSandboxEngine.exe [command]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  install           Install the Windows service");
        Console.WriteLine("  uninstall         Uninstall the Windows service");
        Console.WriteLine("  start             Start the Windows service");
        Console.WriteLine("  stop              Stop the Windows service");
        Console.WriteLine("  --validate-config Validate configuration without starting service");
        Console.WriteLine("  -v                Short form of --validate-config");
        Console.WriteLine("  --help            Show this help information");
        Console.WriteLine("  -h                Short form of --help");
        Console.WriteLine();
        Console.WriteLine("When run without arguments, the service runs in console mode for debugging.");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  AcchuSandboxEngine.exe --validate-config");
        Console.WriteLine("  AcchuSandboxEngine.exe install");
        Console.WriteLine("  AcchuSandboxEngine.exe start");
    }
}