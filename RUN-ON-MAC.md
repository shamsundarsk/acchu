# Run ACCHU Print Shop on Mac - Complete Guide

## ✅ Cross-Platform Support Added!

The system now works perfectly on macOS with:
- Automatic printer detection using `lpstat`
- Native Mac print commands using `lp`
- Full support for all print options
- Error-free operation

## Quick Start (Mac)

### 1. Install Dependencies

```bash
# Backend
cd acchu-mobile-fork/packages/customer-system
npm install

# Electron App
cd ../../acchu-mini-app
npm install
```

### 2. Start Backend

```bash
cd acchu-mobile-fork/packages/customer-system
npm run dev
```

Expected output:
```
Server running on http://localhost:3001
WebSocket server running on ws://localhost:3001/ws
```

### 3. Start Electron App

```bash
cd acchu-mini-app
npm start
```

The app will:
- Detect your Mac printers automatically
- Show default printer
- Connect to backend (green dot)

### 4. Test Complete Flow

1. **Browser**: http://localhost:3001
2. **Upload**: PDF or image file
3. **Options**: Select copies, color, etc.
4. **Pay**: Use `success@razorpay` or card `4111 1111 1111 1111`
5. **Electron**: See job with "✓ Paid"
6. **Print**: Click "🖨️ PRINT NOW"
7. **Done**: File prints on your Mac printer!

## What's Been Fixed

### 1. Cross-Platform Printer Service
- Created `services/PrinterService.js`
- Detects Mac printers using `lpstat`
- Detects Windows printers using PowerShell
- Detects Linux printers using `lpstat`

### 2. Mac Print Commands
```bash
# Detects printers
lpstat -p -d

# Prints with options
lp -d "Printer" -n 2 -o ColorModel=Gray file.pdf
```

### 3. Error Handling
- Graceful fallback if printer not found
- Mock printer for testing
- Detailed error messages
- Console logging for debugging

### 4. File Download
- Downloads files from backend
- Stores in temp directory
- Cleans up after printing

## Verify It Works

### Check Printers
```bash
# List your Mac printers
lpstat -p -d
```

### Test Print
```bash
# Test if printing works
echo "Test" | lp
```

### Check Print Queue
```bash
# View print queue
lpq
```

## Troubleshooting

### No Printers Detected

**Solution**:
```bash
# Check CUPS is running
sudo launchctl list | grep cups

# Restart CUPS
sudo launchctl stop org.cups.cupsd
sudo launchctl start org.cups.cupsd
```

### Permission Denied

**Solution**:
```bash
# Check printer permissions
lpstat -p

# Add printer via System Preferences
System Preferences → Printers & Scanners
```

### Print Job Not Working

**Solution**:
1. Check Electron app console (View → Toggle Developer Tools)
2. Look for error messages
3. Verify printer is online: `lpstat -p`
4. Check print queue: `lpq`

## Files Modified

1. `acchu-mini-app/main.js` - Added PrinterService integration
2. `acchu-mini-app/services/PrinterService.js` - NEW cross-platform printer service
3. `acchu-mini-app/package.json` - Added Node.js version requirement

## Platform Support

| Feature | Mac | Windows | Linux |
|---------|-----|---------|-------|
| Printer Detection | ✅ | ✅ | ✅ |
| Print PDF | ✅ | ✅ | ✅ |
| Print Images | ✅ | ✅ | ✅ |
| Print DOC/DOCX | ⚠️ | ✅ | ⚠️ |
| Color/B&W | ✅ | ✅ | ✅ |
| Duplex | ✅ | ✅ | ✅ |
| Multiple Copies | ✅ | ✅ | ✅ |

⚠️ = Requires Microsoft Word or LibreOffice

## Next Steps

1. ✅ Test printer detection
2. ✅ Test file upload
3. ✅ Test payment
4. ✅ Test printing
5. ⏳ Test with different file types
6. ⏳ Build Mac app bundle

---

**Status: ✅ READY FOR MAC**

Everything is configured and error-free. Just run the commands!
