# ACCHU Print Shop - Mac Setup Guide

## ✅ Cross-Platform Support Added!

The system now works on:
- ✅ macOS (your current system)
- ✅ Windows
- ✅ Linux

## Mac-Specific Features

### Printer Detection
- Uses `lpstat` command to detect printers
- Automatically finds default printer
- Shows printer status (ready/offline)

### Print Commands
- Uses `lp` (Line Printer) command
- Supports all print options:
  - Copies: `-n <number>`
  - Color/B&W: `-o ColorModel=Gray`
  - Duplex: `-o sides=two-sided-long-edge`
  - Paper size: `-o media=A4`

### File Support
- PDF: Native support
- Images (JPG, PNG): Native support
- DOC/DOCX: Requires Microsoft Word or LibreOffice

## Setup Instructions for Mac

### 1. Install Node.js (if not installed)

```bash
# Check if Node.js is installed
node --version

# If not installed, download from:
# https://nodejs.org/
# Or use Homebrew:
brew install node
```

### 2. Install Dependencies

```bash
# Backend
cd acchu-mobile-fork/packages/customer-system
npm install

# Electron App
cd ../../acchu-mini-app
npm install
```

### 3. Configure Printer (Optional)

Check your printers:
```bash
# List all printers
lpstat -p -d

# Test print
echo "Test" | lp
```

### 4. Start Backend

```bash
cd acchu-mobile-fork/packages/customer-system
npm run dev
```

Expected output:
```
Server running on http://localhost:3001
WebSocket server running on ws://localhost:3001/ws
```

### 5. Start Electron App

```bash
cd acchu-mini-app
npm start
```

The app will:
- Detect your Mac printers automatically
- Show default printer in UI
- Connect to backend via WebSocket

## Testing on Mac

### 1. Test Printer Detection

Open Electron app → Should show your default printer name

### 2. Test Complete Flow

1. **Browser**: http://localhost:3001
2. **Upload**: Any PDF or image file
3. **Options**: Select copies, color, etc.
4. **Pay**: Use test credentials:
   - UPI: `success@razorpay`
   - Card: `4111 1111 1111 1111`
5. **Electron**: See job with "✓ Paid"
6. **Print**: Click "🖨️ PRINT NOW"
7. **Result**: File sent to your Mac printer!

### 3. Verify Print Job

Check print queue:
```bash
# View print queue
lpq

# View printer status
lpstat -p
```

## Mac Printer Commands

### List Printers
```bash
lpstat -p -d
```

### Print a File
```bash
# Basic print
lp file.pdf

# With options
lp -d "Printer_Name" -n 2 -o ColorModel=Gray file.pdf
```

### Check Print Queue
```bash
lpq
```

### Cancel Print Job
```bash
cancel <job-id>
```

## Troubleshooting Mac Issues

### Printer Not Detected

**Problem**: Electron app shows "No printer configured"

**Solution**:
```bash
# Check if CUPS is running
sudo launchctl list | grep cups

# Restart CUPS if needed
sudo launchctl stop org.cups.cupsd
sudo launchctl start org.cups.cupsd

# Add printer via System Preferences
System Preferences → Printers & Scanners → Add Printer
```

### Permission Denied

**Problem**: "Permission denied" when printing

**Solution**:
```bash
# Check printer permissions
lpstat -p

# Reset printing system (if needed)
# System Preferences → Printers & Scanners → Right-click → Reset printing system
```

### Print Job Stuck

**Problem**: Print job not completing

**Solution**:
```bash
# View queue
lpq

# Cancel all jobs
cancel -a

# Restart CUPS
sudo launchctl stop org.cups.cupsd
sudo launchctl start org.cups.cupsd
```

### File Not Printing

**Problem**: No error but nothing prints

**Solution**:
1. Check printer is online: `lpstat -p`
2. Check paper/ink levels
3. Try printing from another app
4. Check print queue: `lpq`
5. Look at system logs: `Console.app` → Search "cups"

## Mac vs Windows Differences

| Feature | Mac | Windows |
|---------|-----|---------|
| Printer Command | `lp` | PowerShell |
| Printer Detection | `lpstat` | `Get-Printer` |
| Print System | CUPS | Windows Print Spooler |
| PDF Support | Native | Requires SumatraPDF |
| Config Location | `~/.cups/` | Registry |

## Development Tips for Mac

### Enable Debug Logging

In `main.js`, add:
```javascript
mainWindow.webContents.openDevTools();
```

### Test Print Commands

```bash
# Test if lp works
echo "Test print" | lp

# Test PDF printing
lp ~/Desktop/test.pdf

# Test with options
lp -n 2 -o ColorModel=Gray ~/Desktop/test.pdf
```

### Monitor Print Jobs

```bash
# Watch print queue in real-time
watch -n 1 lpq

# View CUPS logs
tail -f /var/log/cups/error_log
```

## Mac-Specific Features

### 1. AirPrint Support
- Automatically detects AirPrint printers
- No driver installation needed
- Works with iPhone/iPad printers

### 2. PDF Preview
- Mac has native PDF support
- No additional software needed
- High-quality rendering

### 3. System Integration
- Uses native Mac print dialogs
- Respects system printer preferences
- Integrates with Print Center

## Production Deployment on Mac

### Build Mac App

```bash
cd acchu-mini-app
npm run build

# Output: dist/mac/ACCHU Agent.app
```

### Distribute

1. **DMG File** (recommended):
```bash
npm install --save-dev electron-installer-dmg
npm run build:mac
```

2. **App Bundle**:
- Copy `ACCHU Agent.app` to Applications folder
- Users can drag to Applications

### Code Signing (Optional)

For distribution outside App Store:
```bash
# Get Developer ID certificate from Apple
# Sign the app
codesign --deep --force --verify --verbose --sign "Developer ID" "ACCHU Agent.app"
```

## System Requirements

- macOS 10.13 (High Sierra) or later
- Node.js 16.0.0 or later
- 100MB free disk space
- Printer connected (USB, Network, or AirPrint)

## Next Steps

1. ✅ Test printer detection
2. ✅ Test complete payment flow
3. ✅ Test actual printing
4. ⏳ Test with different file types
5. ⏳ Test with different printers
6. ⏳ Build Mac app bundle
7. ⏳ Deploy to production

---

**Status: ✅ READY FOR MAC TESTING**

Everything is configured for macOS. Just run the commands and test!
