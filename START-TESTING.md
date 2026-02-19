# Start Testing - Quick Commands

## ✅ Razorpay Test Keys Already Configured!

Your test keys are set up in the `.env` files. Just run the commands below.

## Step-by-Step Testing

### 1. Install Dependencies (First Time Only)

```bash
# Install backend dependencies
cd acchu-mobile-fork/packages/customer-system
npm install

# Install Electron app dependencies
cd ../../acchu-mini-app
npm install
```

### 2. Start Backend Server

Open Terminal 1:
```bash
cd acchu-mobile-fork/packages/customer-system
npm run dev
```

You should see:
```
Server running on http://localhost:3001
WebSocket server running on ws://localhost:3001/ws
```

### 3. Start Electron App

Open Terminal 2:
```bash
cd acchu-mini-app
npm start
```

The Electron app window will open. Check for:
- Green dot (● Connected) in top right
- "Default Printer - Ready" status

### 4. Test Customer Payment Flow

1. **Open Browser**: http://localhost:3001

2. **Upload File**: 
   - Click upload area
   - Select any PDF, DOC, or image file

3. **Select Print Options**:
   - Copies: 2
   - Color: B&W
   - Duplex: No
   - Paper: A4

4. **Click "Proceed to Pay"**

5. **Razorpay Checkout Opens**

6. **Use Test Credentials**:

   **Option A - Test UPI**:
   - Select UPI
   - Enter: `success@razorpay`
   - Click Pay
   
   **Option B - Test Card**:
   - Select Card
   - Card Number: `4111 1111 1111 1111`
   - CVV: `123`
   - Expiry: `12/25`
   - Name: `Test User`
   - Click Pay

7. **Payment Succeeds** ✅

8. **Check Electron App**:
   - Job appears in queue
   - Shows "✓ Paid" badge
   - "🖨️ PRINT NOW" button is active

9. **Click "PRINT NOW"**

10. **Job Sent to Printer** ✅

## Quick Test (Copy-Paste)

```bash
# Terminal 1 - Backend
cd acchu-mobile-fork/packages/customer-system && npm run dev

# Terminal 2 - Electron App
cd acchu-mini-app && npm start

# Then open browser: http://localhost:3001
```

## Test Payment Credentials

### Always Works:
- **UPI**: `success@razorpay`
- **Card**: `4111 1111 1111 1111` | CVV: `123` | Expiry: `12/25`

### Always Fails (for testing error handling):
- **UPI**: `failure@razorpay`

## What to Check

### Backend Running ✅
- Terminal shows "Server running on http://localhost:3001"
- No error messages
- WebSocket server started

### Electron App Connected ✅
- Green dot (● Connected) visible
- "Default Printer - Ready" shown
- No red "Disconnected" status

### Payment Works ✅
- Razorpay checkout opens
- Test credentials accepted
- Payment success message shown
- Job appears in Electron app

### Print Flow Works ✅
- Job shows "✓ Paid" badge
- "PRINT NOW" button clickable
- Job sent to printer
- Job removed from queue

## Troubleshooting

### Backend Won't Start
```bash
# Check if port 3001 is in use
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process if needed
kill -9 <PID>  # Mac/Linux
```

### Electron App Shows "Disconnected"
1. Make sure backend is running first
2. Check backend terminal for errors
3. Restart Electron app
4. Check `.env` file has correct `BACKEND_URL`

### Razorpay Checkout Not Opening
1. Check browser console (F12)
2. Disable popup blocker
3. Try different browser
4. Check backend logs for errors

### Payment Verification Failed
1. Check API keys in `.env` file
2. Verify keys are correct (no extra spaces)
3. Check backend logs
4. Try again with test credentials

## Expected Output

### Backend Terminal:
```
Server running on http://localhost:3001
WebSocket server running on ws://localhost:3001/ws
New WebSocket connection
Client joined session: session-xxx
Payment order created: order_xxx
Payment verified successfully
Print job created: job-xxx
```

### Electron App:
```
Connected to backend
Received message: create-print-job
Print queue updated: 1 job
Payment completed for job: job-xxx
Print job executed: job-xxx
```

## Next Steps After Testing

1. ✅ Verify complete flow works
2. ✅ Test with different file types
3. ✅ Test with different print options
4. ✅ Test payment failure scenario
5. ⏳ Connect real printer
6. ⏳ Test actual printing
7. ⏳ Deploy backend to production
8. ⏳ Build Electron installer
9. ⏳ Get Razorpay live keys (when ready)

## Files to Check

### Backend Logs:
- Check terminal output
- Look for error messages
- Verify WebSocket connections

### Electron App Logs:
- Open DevTools: View → Toggle Developer Tools
- Check Console tab
- Look for WebSocket messages

### Browser Logs:
- Press F12
- Check Console tab
- Look for Razorpay errors

---

**Everything is configured! Just run the commands and test.**

**Test Credentials**: UPI: `success@razorpay` | Card: `4111 1111 1111 1111`
