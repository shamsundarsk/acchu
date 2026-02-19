# ACCHU Electron App Setup Guide

## Overview

The ACCHU Electron app is a desktop application for print shop owners that:
- Connects to your backend via WebSocket
- Receives print jobs in real-time
- Shows payment status
- Allows one-click printing
- NO file preview (shop owner can't see customer files)
- NO settings modification (all settings chosen by customer)

## Installation

### 1. Install Dependencies

```bash
cd acchu-mini-app
npm install
```

### 2. Configure Backend URL

Create `.env` file in `acchu-mini-app/`:

```env
BACKEND_URL=http://localhost:3001
```

For production, use your deployed backend URL:
```env
BACKEND_URL=https://your-backend-domain.com
```

### 3. Run in Development

```bash
npm start
```

This will:
- Launch the Electron app
- Connect to backend WebSocket
- Show the print queue interface

### 4. Build for Production

```bash
# Build Windows installer
npm run build:win

# Output will be in: acchu-mini-app/dist/
```

## Features

### 1. Real-Time Connection
- Connects to backend via WebSocket
- Auto-reconnects if connection drops
- Shows connection status (green dot = connected)

### 2. Print Queue Display
Each job shows:
- 📄 File name (no preview)
- Payment status badge (✓ Paid or ⏳ Awaiting Payment)
- Print settings (copies, color, duplex, paper size)
- Amount paid
- Status badge (⏳ Pending, 🖨️ Printing, ✓ Completed)

### 3. One-Click Printing
- "🖨️ PRINT NOW" button only active when payment is completed
- Click to send job to printer
- Job automatically removed after completion

### 4. System Tray
- Runs in system tray when window closed
- Shows pending job count
- Shows connection status
- Right-click for menu

## UI Components

### Main Window
```
┌─────────────────────────────────────────┐
│ 🖨️ ACCHU Print Shop    ● Connected     │
├─────────────────────────────────────────┤
│                                         │
│  🖨️ Default Printer                    │
│     Ready                               │
│                                         │
│  Print Queue                    2 jobs  │
│  ┌───────────────────────────────────┐ │
│  │ 📄 Document.pdf                   │ │
│  │ ✓ Paid  ⏳ Pending                │ │
│  │ Copies: 2 | Color: B&W | ₹4.00   │ │
│  │           [🖨️ PRINT NOW]          │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### System Tray Menu
```
Open Print Shop
─────────────────
Pending Jobs: 2
● Connected
─────────────────
Quit
```

## WebSocket Messages

### Received from Backend:

1. **create-print-job**
```json
{
  "type": "create-print-job",
  "jobId": "job-123",
  "sessionId": "session-456",
  "data": {
    "fileName": "document.pdf",
    "fileUrl": "https://...",
    "printOptions": {
      "copies": 2,
      "colorMode": "bw",
      "duplex": false,
      "paperSize": "A4"
    },
    "pricing": {
      "totalAmount": 400
    },
    "paymentStatus": "pending"
  }
}
```

2. **payment-completed**
```json
{
  "type": "payment-completed",
  "jobId": "job-123",
  "sessionId": "session-456"
}
```

3. **print-job-status-update**
```json
{
  "type": "print-job-status-update",
  "jobId": "job-123",
  "data": {
    "status": "printing"
  }
}
```

### Sent to Backend:

1. **local-agent-connected**
```json
{
  "type": "local-agent-connected",
  "data": {
    "shopId": "shop-001",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## API Integration

### Print Job Execution

When shop owner clicks "PRINT NOW":

```javascript
POST /api/print-jobs/{sessionId}/execute/{jobId}

Response:
{
  "success": true,
  "message": "Print job sent to printer"
}
```

## File Structure

```
acchu-mini-app/
├── main.js              # Main Electron process
├── preload.js           # Secure IPC bridge
├── package.json         # Dependencies & build config
├── renderer/
│   ├── index.html       # UI structure
│   ├── renderer.js      # UI logic
│   └── styles.css       # Styling
└── assets/
    ├── icon.ico         # App icon
    └── tray-icon.png    # System tray icon
```

## Security Features

1. **Context Isolation**: Enabled
2. **Node Integration**: Disabled
3. **Secure IPC**: Only exposed necessary APIs
4. **No File Preview**: Shop owner can't see file contents
5. **Payment Verification**: Only prints after payment confirmed

## Troubleshooting

### Connection Issues

**Problem**: Red dot, "Disconnected" status

**Solutions**:
1. Check backend is running
2. Verify `BACKEND_URL` in `.env`
3. Check firewall settings
4. Look at console logs (View → Toggle Developer Tools)

### Print Jobs Not Appearing

**Problem**: Queue stays empty

**Solutions**:
1. Check WebSocket connection (should be green)
2. Test customer upload flow
3. Check backend logs
4. Verify WebSocket messages in DevTools

### Print Button Disabled

**Problem**: Can't click "PRINT NOW"

**Reasons**:
- Payment not completed (check badge)
- Job already printing
- Job already completed

## Development Tips

### Enable DevTools

In `main.js`, add:
```javascript
mainWindow.webContents.openDevTools();
```

### Mock Print Jobs

For testing without backend:
```javascript
// In renderer.js
const mockJobs = [
  {
    id: 'test-1',
    fileName: 'test.pdf',
    printOptions: { copies: 1, colorMode: 'bw', duplex: false, paperSize: 'A4' },
    pricing: { totalAmount: 200 },
    paymentStatus: 'completed',
    status: 'pending'
  }
];
```

### Test WebSocket

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:3001/ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', e.data);
```

## Production Deployment

### 1. Build Installer

```bash
npm run build:win
```

### 2. Distribute

- Installer: `dist/ACCHU Agent Setup 1.0.0.exe`
- Portable: `dist/win-unpacked/`

### 3. Auto-Update (Optional)

Add to `package.json`:
```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "your-username",
    "repo": "your-repo"
  }
}
```

## Next Steps

1. ✅ Electron app built with simplified UI
2. ✅ WebSocket integration complete
3. ✅ Payment status tracking
4. ⏳ Test with real backend
5. ⏳ Test with real printer
6. ⏳ Build Windows installer
7. ⏳ Deploy to shop PC

## Support

For issues or questions:
1. Check console logs (DevTools)
2. Check backend logs
3. Verify WebSocket connection
4. Test with mock data first

---

**Status: ✅ READY FOR TESTING**
