# ACCHU Print Shop - Quick Start Guide

## Complete System Overview

```
Customer (Web Browser)
        ↓
    Upload File + Settings
        ↓
    Backend API (Node.js)
        ↓
    Razorpay Payment
        ↓
    WebSocket
        ↓
Electron App (Shop PC)
        ↓
    Local Printer
```

## What You Have Now

### ✅ Customer Web Interface
- File upload (PDF, DOC, DOCX, JPG, PNG)
- Print settings (copies, color, duplex, paper size)
- Real-time pricing calculation
- Razorpay payment integration
- Payment status tracking

### ✅ Backend API
- Session management
- File storage
- Print job queue
- Payment processing (Razorpay)
- WebSocket server
- Real-time updates

### ✅ Electron Desktop App
- Simplified shop owner UI
- Real-time print queue
- Payment status badges
- One-click printing
- No file preview (security)
- System tray integration

## Setup Instructions

### 1. Backend Setup

```bash
cd acchu-mobile-fork/packages/customer-system

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
PORT=3001
NODE_ENV=development
EOF

# Start backend
npm run dev
```

Backend will run on: `http://localhost:3001`

### 2. Get Razorpay Keys

1. Go to https://dashboard.razorpay.com/
2. Sign up / Log in
3. Navigate to Settings → API Keys
4. Generate Test Mode keys
5. Copy Key ID and Key Secret
6. Update `.env` file

### 3. Electron App Setup

```bash
cd acchu-mini-app

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
BACKEND_URL=http://localhost:3001
EOF

# Start Electron app
npm start
```

### 4. Test the Complete Flow

#### Step 1: Customer Uploads File
1. Open browser: `http://localhost:3001`
2. Upload a PDF file
3. Select print options:
   - Copies: 2
   - Color: B&W
   - Duplex: No
   - Paper: A4
4. See calculated price

#### Step 2: Customer Pays
1. Click "Proceed to Pay"
2. Razorpay checkout opens
3. Use test credentials:
   - UPI: `success@razorpay`
   - Card: `4111 1111 1111 1111`
   - CVV: Any 3 digits
   - Expiry: Any future date
4. Complete payment

#### Step 3: Shop Owner Prints
1. Check Electron app
2. See new job with "✓ Paid" badge
3. Click "🖨️ PRINT NOW"
4. Job sent to printer

## File Structure

```
acchu-mobile-fork/
└── packages/
    └── customer-system/
        ├── src/
        │   ├── server/              # Backend API
        │   │   ├── index.ts         # Main server
        │   │   ├── routes/          # API endpoints
        │   │   │   ├── sessions.ts
        │   │   │   ├── files.ts
        │   │   │   ├── payments.ts  # Razorpay integration
        │   │   │   └── printJobs.ts
        │   │   └── services/
        │   │       └── RazorpayService.ts
        │   └── client/              # Customer web UI
        │       ├── components/
        │       │   ├── FileUpload.tsx
        │       │   ├── PrintOptions.tsx
        │       │   └── PaymentInterface.tsx
        │       └── pages/
        │           └── SessionPage.tsx
        └── package.json

acchu-mini-app/
├── main.js                  # Electron main process
├── preload.js               # IPC bridge
├── renderer/
│   ├── index.html           # Shop owner UI
│   ├── renderer.js          # UI logic
│   └── styles.css           # Styling
└── package.json
```

## API Endpoints

### Sessions
- `POST /api/sessions/create` - Create new session
- `GET /api/sessions/:sessionId/validate` - Validate session

### Files
- `POST /api/sessions/:sessionId/upload` - Upload files

### Payments
- `POST /api/payments/:sessionId/create-order` - Create Razorpay order
- `POST /api/payments/:sessionId/verify` - Verify payment
- `GET /api/payments/:sessionId/status/:orderId` - Get payment status

### Print Jobs
- `POST /api/print-jobs/:sessionId/create` - Create print job
- `POST /api/print-jobs/:sessionId/execute/:jobId` - Execute print
- `GET /api/print-jobs/:sessionId/status` - Get job status

## WebSocket Events

### Backend → Electron App
- `create-print-job` - New job created
- `payment-completed` - Payment successful
- `print-job-status-update` - Job status changed

### Electron App → Backend
- `local-agent-connected` - App connected
- `print-job-status-update` - Print status update

## Testing Checklist

### Customer Flow
- [ ] Upload PDF file
- [ ] Upload DOC/DOCX file
- [ ] Upload image file
- [ ] Select print options
- [ ] See correct pricing
- [ ] Complete payment (test mode)
- [ ] See payment confirmation

### Shop Owner Flow
- [ ] See job in queue
- [ ] See "Awaiting Payment" badge
- [ ] See "Paid" badge after payment
- [ ] Click "PRINT NOW" button
- [ ] Job sent to printer
- [ ] Job removed from queue

### System Integration
- [ ] Backend starts successfully
- [ ] Electron app connects to backend
- [ ] WebSocket connection stable
- [ ] Real-time updates work
- [ ] Payment verification works
- [ ] Print job execution works

## Common Issues

### Backend Won't Start
```bash
# Check if port 3001 is in use
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill process if needed
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows
```

### Electron App Won't Connect
1. Check backend is running
2. Verify `BACKEND_URL` in `.env`
3. Check firewall settings
4. Look at console logs (DevTools)

### Payment Fails
1. Check Razorpay keys in `.env`
2. Use test credentials
3. Check backend logs
4. Verify Razorpay dashboard

### Print Job Not Appearing
1. Check WebSocket connection (green dot)
2. Check backend logs
3. Check Electron app console
4. Verify payment completed

## Production Deployment

### 1. Backend Deployment

```bash
# Build
npm run build

# Deploy to server (example: Vercel, Railway, etc.)
# Set environment variables:
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
NODE_ENV=production
```

### 2. Electron App Distribution

```bash
# Build Windows installer
cd acchu-mini-app
npm run build:win

# Distribute installer to shop owners
# File: dist/ACCHU Agent Setup 1.0.0.exe
```

### 3. Update Electron App Config

Shop owners need to update `.env`:
```env
BACKEND_URL=https://your-production-backend.com
```

## Next Steps

1. **Test Complete Flow**
   - Run backend
   - Run Electron app
   - Test customer upload → payment → print

2. **Get Razorpay Live Keys**
   - Complete KYC
   - Get live mode keys
   - Update production config

3. **Test with Real Printer**
   - Connect printer to shop PC
   - Test print execution
   - Verify print settings work

4. **Deploy Backend**
   - Choose hosting (Vercel, Railway, AWS, etc.)
   - Deploy backend
   - Update Electron app config

5. **Distribute Electron App**
   - Build Windows installer
   - Install on shop PC
   - Configure backend URL
   - Test end-to-end

## Support & Documentation

- **Razorpay Docs**: https://razorpay.com/docs/
- **Electron Docs**: https://www.electronjs.org/docs
- **WebSocket Docs**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

## Architecture Decisions

### Why Electron?
- Access to local printer
- System tray integration
- Cross-platform (Windows, Mac, Linux)
- Easy distribution

### Why WebSocket?
- Real-time updates
- Bidirectional communication
- Low latency
- Persistent connection

### Why Razorpay?
- Easy integration
- Multiple payment methods (UPI, Card, Wallet)
- Test mode for development
- Good documentation

### Why No File Preview?
- Security: Shop owner shouldn't see customer files
- Privacy: Customer documents are private
- Simplicity: Shop owner just needs to print
- Trust: Customer already paid, just execute

---

**Status: ✅ READY TO TEST**

Start with backend, then Electron app, then test the complete flow!
