# 🔄 How to Restart Electron App

## ❌ Problem:
You're seeing WebSocket 403 errors because the old code is still running in memory.

## ✅ Solution:
Completely stop and restart the Electron app.

## 🚀 Quick Fix:

### Option 1: Use the restart script
```bash
./restart-electron.sh
```

### Option 2: Manual restart
```bash
# 1. Kill all Electron processes
pkill -f Electron
pkill -f acchu-mini-app

# 2. Wait 2 seconds
sleep 2

# 3. Start fresh
cd acchu-mini-app
npm start
```

### Option 3: Force quit from Activity Monitor (Mac)
1. Open **Activity Monitor** (Cmd+Space, type "Activity Monitor")
2. Search for "Electron" or "acchu"
3. Select the process
4. Click **X** (Force Quit)
5. Go to terminal:
   ```bash
   cd acchu-mini-app
   npm start
   ```

## ✅ What You Should See After Restart:

### In Console:
```
Starting HTTP polling for print jobs
Polling for new jobs...
● Connected
```

### NOT This (old code):
```
Connecting to backend: wss://acchu-six.vercel.app/ws  ❌
WebSocket error: 403  ❌
```

## 🔍 How to Verify It's Working:

1. **Check console output** - Should say "Starting HTTP polling"
2. **No WebSocket errors** - Should not see "wss://" or "403"
3. **Tray icon** - Should show "● Connected"
4. **No reconnection attempts** - Should be stable

## 🐛 If Still Seeing WebSocket Errors:

The app might be running from a different location. Try:

```bash
# Find all running Electron processes
ps aux | grep -i electron

# Kill them all
killall Electron

# Or more aggressive:
sudo killall -9 Electron

# Then restart
cd ~/Desktop/projects/Genesis\ 2.0/acchu-mini-app
npm start
```

## 📝 What Changed in the Code:

### Old Code (Removed):
```javascript
const WebSocket = require('ws');
let ws = null;
const WS_URL = BACKEND_URL.replace('http', 'ws') + '/ws';

function connectWebSocket() {
  ws = new WebSocket(WS_URL);  // ❌ This causes 403 on Vercel
  // ...
}
```

### New Code (Current):
```javascript
// No WebSocket import!
let pollingInterval = null;
const POLLING_INTERVAL = 5000;

function pollForJobs() {
  axios.get(`${BACKEND_URL}/api/print-jobs/pending`)  // ✅ Works on Vercel
  // ...
}
```

## 🎯 Expected Behavior:

### Every 5 seconds:
```
→ HTTP GET https://acchu-six.vercel.app/api/print-jobs/pending
← Response: { success: true, jobs: [...] }
→ Update print queue
→ Notify UI
```

### No WebSocket:
- ❌ No "wss://" connections
- ❌ No 403 errors
- ❌ No reconnection attempts
- ✅ Just simple HTTP polling

## 🚀 After Successful Restart:

You should see:
```
✅ Starting HTTP polling for print jobs
✅ Printer service initialized
✅ Default printer: [Your Printer Name]
✅ Polling for new jobs...
✅ ● Connected
```

---

**Action Required**: 
1. **Force quit** the Electron app completely
2. **Run**: `./restart-electron.sh` OR manually restart
3. **Verify**: No more WebSocket errors!
