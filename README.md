# ACCHU Sandbox Engine

A secure Windows service that creates ephemeral sandbox workspaces for customer document printing with automatic data destruction.

## Project Structure

```
AcchuSandboxEngine/
├── src/AcchuSandboxEngine/           # Main service project
│   ├── Configuration/                # Configuration models
│   ├── Interfaces/                   # Core service interfaces
│   ├── Models/                       # Data models and DTOs
│   ├── Services/                     # Service implementations
│   ├── Program.cs                    # Service host entry point
│   ├── AcchuSandboxWorker.cs        # Background service worker
│   └── appsettings.json             # Configuration files
├── tests/AcchuSandboxEngine.Tests/   # Test project
│   ├── UnitTests/                    # Unit tests
│   ├── PropertyTests/                # Property-based tests
│   └── appsettings.Test.json        # Test configuration
└── AcchuSandboxEngine.sln           # Solution file
```

## Core Components

- **Session Manager**: Orchestrates session lifecycle and coordinates between components
- **File System Manager**: Creates sandboxes, manages file operations, enforces Windows ACLs
- **Print Manager**: Interfaces with Windows Print Spooler, enforces print constraints
- **Security Manager**: Validates tokens, enforces fail-closed behavior, logs security events
- **Cleanup Manager**: Performs secure deletion, clears system caches, validates cleanup

## Requirements

- .NET 8.0 SDK
- Windows OS (for Windows Service and ACL support)
- Visual Studio 2022 or VS Code

## Building

```bash
dotnet build
```

## Testing

```bash
dotnet test
```

## Configuration

The service uses `appsettings.json` for configuration with sections for:
- Sandbox settings (temp directories, file limits, security)
- Print settings (printer configuration, limits)
- Logging configuration

## Security Model

The system implements a fail-closed security model where any failure results in immediate session termination and data cleanup. All operations are logged for audit purposes while protecting customer data privacy.