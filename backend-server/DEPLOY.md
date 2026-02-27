# Deploy Backend Server to Railway.app

## Step 1: Create Railway Account
1. Go to https://railway.app
2. Click "Login" → Sign in with GitHub
3. Authorize Railway to access your GitHub

## Step 2: Deploy from GitHub
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository: `acchu-mobile-fork`
4. Railway will detect the Node.js app

## Step 3: Configure Root Directory
1. In Railway dashboard, go to Settings
2. Find "Root Directory"
3. Set it to: `backend-server`
4. Click "Save"

## Step 4: Deploy
1. Railway will automatically build and deploy
2. Wait for deployment to complete (2-3 minutes)
3. You'll get a URL like: `https://your-app.up.railway.app`

## Step 5: Get Your Backend URL
1. In Railway dashboard, click "Settings"
2. Under "Domains", you'll see your public URL
3. Copy this URL (e.g., `https://acchu-backend.up.railway.app`)

## Step 6: Update Electron App
Edit `acchu-mini-app/main.js`:
```javascript
const BACKEND_URL = 'https://YOUR-RAILWAY-URL.up.railway.app';
```

## Step 7: Update Mobile Frontend
Edit `acchu-mobile-fork/packages/customer-system/src/client/pages/SessionPage.tsx`:

Find all `fetch('/api/...` calls and replace with:
```javascript
fetch('https://YOUR-RAILWAY-URL.up.railway.app/api/...'
```

## Alternative: Use Environment Variable
Set `BACKEND_URL` environment variable in Railway dashboard.

## Test Deployment
```bash
curl https://YOUR-RAILWAY-URL.up.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "uptime": 123.45,
  "totalJobs": 0,
  "pendingJobs": 0
}
```

## Free Tier Limits
- Railway free tier: $5/month credit
- Should be enough for development/testing
- Server sleeps after 30 min of inactivity (wakes up automatically)

## Done!
Your backend is now running 24/7 and jobs will persist properly!
