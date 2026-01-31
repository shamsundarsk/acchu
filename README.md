# SecurePrint Session (SPS)

A secure, ephemeral printing system designed for public PCs in Indian retail environments.

## Architecture

This is a monorepo containing three main packages:

- **`@sps/shared-types`**: Common TypeScript interfaces and types
- **`@sps/local-agent`**: Electron desktop application for shop PCs
- **`@sps/customer-system`**: React web application for customers

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
# Install dependencies for all packages
npm install

# Build shared types first
npm run build --workspace=@sps/shared-types
```

### Development

```bash
# Start both Local Agent and Customer System in development mode
npm run dev

# Or start them individually:
npm run dev:local-agent
npm run dev:customer-system
```

### Building

```bash
# Build all packages
npm run build

# Build individual packages
npm run build --workspace=@sps/local-agent
npm run build --workspace=@sps/customer-system
```

### Testing

```bash
# Run tests for all packages
npm test

# Run tests for specific package
npm test --workspace=@sps/local-agent
```

## Package Details

### Local Agent (@sps/local-agent)

Electron desktop application that runs on shop PCs:

- **Main Process**: Session management, file handling, print job execution
- **Renderer Process**: React UI for shopkeepers
- **Development**: `npm run dev:local-agent`
- **Build**: Creates Windows executable via electron-builder

### Customer System (@sps/customer-system)

Web application for customers:

- **Frontend**: React SPA with file upload and print configuration
- **Backend**: Express.js API server with WebSocket support
- **Development**: Frontend on port 3000, Backend on port 3001
- **Build**: Static files for deployment

### Shared Types (@sps/shared-types)

Common TypeScript definitions:

- Session management interfaces
- File handling types
- Print job and payment models
- API response structures

## Security Features

- **Session Isolation**: Each customer gets a unique, isolated session
- **Automatic Cleanup**: Files are securely deleted after 30 minutes or session end
- **Multi-pass Deletion**: Files are overwritten multiple times before removal
- **Fail-Closed Design**: System failures result in immediate data destruction
- **No Persistent Storage**: Customer data never persists beyond session lifetime

## Configuration

The system uses configuration files for:

- Print pricing (color/BW rates, duplex discounts)
- Session timeouts and file limits
- Printer selection and supported formats
- Shop identification and settings

Configuration files are located in the Local Agent package and can be modified without code changes.