# ACCHU Sandbox Engine - Web & Mobile Integration

## 🎯 Overview

This integration connects your AcchuSandboxEngine with web and mobile frontend systems to create a complete secure printing solution for Indian xerox shops.

## 🏗️ Architecture

```
Customer Mobile (React) ──┐
                          ├──► AcchuSandboxEngine ──► Printer
Shopkeeper Web (Electron) ──┘
```

## 🔄 Complete Workflow

### STEP 1: Shopkeeper Setup
1. **Shopkeeper logs into web portal**
   - `POST /api/integration/shopkeeper/generate-qr`
   - Receives QR code + sandbox installer download

2. **Downloads and installs sandbox**
   - `GET /api/integration/download/sandbox`
   - Installs AcchuSandboxEngine on PC

### STEP 2: Customer Interaction
1. **Customer scans QR code**
   - QR contains session ID + API endpoint
   - Opens mobile web interface (no app needed)

2. **Customer uploads file with preferences**
   - `POST /api/integration/customer/upload`
   - Selects copies, color, duplex via dropdowns
   - System generates print rules automatically

### STEP 3: Shopkeeper Action
1. **Shopkeeper sees pending job**
   - `GET /api/integration/shopkeeper/{sessionId}/pending-jobs`
   - Shows file name, preferences, estimated cost

2. **Shopkeeper clicks PRINT (only action available)**
   - `POST /api/integration/shopkeeper/{sessionId}/print/{fileName}`
   - Triggers secure printing

### STEP 4: Automatic Cleanup
1. **Print completion triggers cleanup**
   - Files securely overwritten (3-pass deletion)
   - Print spooler cleared
   - Session invalidated
   - Real-time notifications sent

## 🔌 API Endpoints

### Shopkeeper Web Interface
```http
POST /api/integration/shopkeeper/generate-qr
GET  /api/integration/shopkeeper/{sessionId}/pending-jobs
POST /api/integration/shopkeeper/{sessionId}/print/{fileName}
GET  /api/integration/download/sandbox
```

### Customer Mobile Interface
```http
POST /api/integration/customer/upload
GET  /api/integration/customer/{sessionId}/status
```

### Real-time Updates
```
WebSocket: /integration-hub
Events: FileUploaded, PrintStarted, PrintCompleted, SessionEnded
```

## 📱 Frontend Integration

### Customer Mobile (React/HTML)
```javascript
// Upload file with preferences
const formData = new FormData();
formData.append('file', file);
formData.append('sessionId', sessionId);
formData.append('copies', copies);
formData.append('isColor', isColor);
formData.append('isDuplex', isDuplex);

fetch('/api/integration/customer/upload', {
    method: 'POST',
    body: formData
});
```

### Shopkeeper Web (Electron/HTML)
```javascript
// Get pending jobs
const response = await fetch(`/api/integration/shopkeeper/${sessionId}/pending-jobs`);
const jobs = await response.json();

// Print job
await fetch(`/api/integration/shopkeeper/${sessionId}/print/${fileName}`, {
    method: 'POST'
});
```

### Real-time Updates (SignalR)
```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/integration-hub")
    .build();

connection.on("StatusUpdate", (update) => {
    console.log(`${update.eventType}: ${update.message}`);
});

// Join session for updates
await connection.invoke("JoinCustomerSession", sessionId);
await connection.invoke("JoinShopkeeperSession", sessionId);
```

## 🔒 Security Features

### Data Isolation
- Each session gets isolated sandbox workspace
- Windows ACLs prevent shopkeeper file access
- Session exclusivity (one customer at a time)

### Secure Cleanup
- 3-pass file overwriting
- Print spooler clearing
- Memory cleanup
- Session token invalidation

### Fail-Closed Security
- Any error triggers immediate cleanup
- Network failures invalidate session
- Crash recovery on service restart

## 🚀 Getting Started

### 1. Build & Run Engine
```bash
cd src/AcchuSandboxEngine
dotnet build
dotnet run
```

### 2. Test Integration
Open `integration-demo.html` in browser to test the complete workflow.

### 3. Configure Settings
Update `appsettings.json`:
```json
{
  "Integration": {
    "ApiBaseUrl": "http://localhost:8080",
    "Pricing": {
      "BlackWhitePerPage": 2.0,
      "ColorPerPage": 6.0,
      "DuplexDiscount": 0.2,
      "ServiceFee": 1.0
    }
  }
}
```

## 📊 Data Flow

### Customer Upload Flow
```
Mobile App → IntegrationController.CustomerUpload() 
          → SessionManager.ProcessFileAsync() 
          → FileSystemManager.StoreFileAsync() 
          → SignalR notification to shopkeeper
```

### Shopkeeper Print Flow
```
Web App → IntegrationController.ExecutePrint() 
        → SessionManager.ExecutePrintJobAsync() 
        → PrintManager.SubmitPrintJobAsync() 
        → CleanupManager.PerformFullCleanupAsync()
```

## 🔧 Configuration

### Integration Settings
- **SessionTimeoutMinutes**: How long sessions stay active (default: 60)
- **MaxFileSize**: Maximum upload size (default: 100MB)
- **AllowedFileTypes**: Supported file formats
- **Pricing**: Cost calculation parameters

### Security Settings
- **JwtSecretKey**: Token signing key (change in production!)
- **AllowedActions**: Actions shopkeeper can perform (Print, Preview)
- **RestrictedActions**: Blocked actions (Save, Copy, Export, etc.)

## 🎯 Key Benefits

### For Customers
- ✅ No app installation required
- ✅ Simple dropdown interface
- ✅ Real-time status updates
- ✅ Guaranteed data privacy

### For Shopkeepers
- ✅ Minimal training required
- ✅ Cannot access customer files
- ✅ Automatic cost calculation
- ✅ One-click printing

### For System
- ✅ Zero data residue
- ✅ Fail-closed security
- ✅ Audit logging
- ✅ Crash recovery

## 🐛 Troubleshooting

### Common Issues

**"Session not found"**
- Check if QR code is still valid (expires after 8 hours)
- Ensure AcchuSandboxEngine is running

**"File upload failed"**
- Check file size (max 100MB)
- Verify file type is allowed
- Ensure session is active

**"Print job failed"**
- Check printer is online and accessible
- Verify print spooler service is running
- Check Windows permissions

### Debug Mode
Run with debug logging:
```bash
dotnet run --environment Development
```

Check logs in: `%TEMP%\AcchuSandbox\Logs\`

## 🔄 Next Steps

1. **Deploy to Production**
   - Update JWT secret key
   - Configure HTTPS certificates
   - Set up proper CORS origins

2. **Integrate with Existing Systems**
   - Connect to your authentication system
   - Integrate with payment processing
   - Add custom branding

3. **Scale for Multiple Shops**
   - Add shop management
   - Implement usage analytics
   - Add remote monitoring

## 📞 Support

For integration support:
1. Check the demo HTML file for working examples
2. Review API documentation in controllers
3. Check logs for detailed error information
4. Test with the provided integration endpoints

---

**🎉 Your AcchuSandboxEngine is now ready for web and mobile integration!**