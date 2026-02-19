# 🚀 Deployment Guide - Make QR Code Work

## 🎯 The Problem

**Current Setup (Local Only)**:
```
QR Code → http://192.168.1.100:3003 (Only works on same WiFi)
```

**What We Need (Online)**:
```
QR Code → https://your-app.vercel.app (Works from anywhere!)
```

## 📋 What Needs to Be Deployed

### 1. Customer Web Interface (MUST DEPLOY)
- **What**: React app for customers
- **Location**: `acchu-mobile-fork/packages/customer-system`
- **Deploy To**: Vercel (Free, Easy)
- **URL**: `https://acchu-print.vercel.app` (example)

### 2. Backend API (MUST DEPLOY)
- **What**: Node.js server
- **Location**: `acchu-mobile-fork/packages/customer-system/src/server`
- **Deploy To**: Railway, Render, or Vercel
- **URL**: `https://acchu-api.railway.app` (example)

### 3. Electron App (NO DEPLOYMENT)
- **What**: Desktop app for shop owner
- **Location**: `acchu-mini-app`
- **Deploy To**: Install on shop PC only
- **Connection**: Connects to deployed backend

## 🚀 Deployment Options

### Option 1: Vercel (Recommended - Easiest)

**Pros**:
- Free tier available
- Automatic deployments
- Fast CDN
- Easy setup

**Cons**:
- Serverless (may need adjustments)
- Cold starts

### Option 2: Railway

**Pros**:
- Easy Node.js deployment
- Free $5 credit
- Always-on server
- WebSocket support

**Cons**:
- Requires credit card
- Paid after free credit

### Option 3: Render

**Pros**:
- Free tier
- Always-on
- Easy deployment

**Cons**:
- Slower than Vercel
- Free tier has limits

## 📝 Step-by-Step Deployment

### Step 1: Prepare Code for Deployment

#### A. Update Environment Variables

Create `.env.production`:
```env
# Backend URL (will be your deployed backend)
VITE_API_URL=https://your-backend.railway.app

# Razorpay Keys
RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI

# Node Environment
NODE_ENV=production
```

#### B. Update Backend CORS

In `src/server/index.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:3003',
    'https://your-frontend.vercel.app' // Add your deployed URL
  ]
}));
```

### Step 2: Deploy Backend (Railway)

#### A. Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project"

#### B. Deploy from GitHub
1. Connect your GitHub repo
2. Select `acchu-mobile-fork/packages/customer-system`
3. Add environment variables:
   ```
   RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
   RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI
   PORT=3001
   NODE_ENV=production
   ```
4. Deploy!

#### C. Get Backend URL
- Railway gives you: `https://your-app.railway.app`
- Copy this URL

### Step 3: Deploy Frontend (Vercel)

#### A. Create Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "New Project"

#### B. Deploy from GitHub
1. Import your GitHub repo
2. Select `acchu-mobile-fork/packages/customer-system`
3. Framework: Vite
4. Root Directory: `acchu-mobile-fork/packages/customer-system`
5. Build Command: `npm run build:client`
6. Output Directory: `dist/client`

#### C. Add Environment Variables
```
VITE_API_URL=https://your-backend.railway.app
```

#### D. Deploy!
- Vercel gives you: `https://your-app.vercel.app`
- Copy this URL

### Step 4: Update Electron App

Update `acchu-mini-app/.env`:
```env
# Use deployed backend URL
BACKEND_URL=https://your-backend.railway.app

# Frontend URL for QR code
FRONTEND_URL=https://your-frontend.vercel.app
```

Update `main.js` QR code generation:
```javascript
const customerUrl = process.env.FRONTEND_URL || `http://${localIP}:3003`;
```

### Step 5: Test Everything

1. **Test Backend**:
   ```bash
   curl https://your-backend.railway.app/api/health
   ```

2. **Test Frontend**:
   - Open: `https://your-frontend.vercel.app`
   - Should see customer interface

3. **Test QR Code**:
   - Open Electron app
   - Click "Show QR Code"
   - Scan with phone
   - Should open deployed frontend

## 🔧 Quick Deploy Commands

### Deploy Backend to Railway:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
cd acchu-mobile-fork/packages/customer-system
railway init

# Deploy
railway up
```

### Deploy Frontend to Vercel:

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd acchu-mobile-fork/packages/customer-system
vercel --prod
```

## 📦 Alternative: All-in-One Deployment

### Use Vercel for Both (Simpler)

**Structure**:
```
acchu-mobile-fork/packages/customer-system/
├── src/
│   ├── client/     → Frontend (Vercel)
│   └── server/     → Backend (Vercel Serverless)
├── vercel.json     → Configuration
└── package.json
```

**Create `vercel.json`**:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/server/index.ts",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist/client"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "src/server/index.ts"
    },
    {
      "src": "/(.*)",
      "dest": "dist/client/$1"
    }
  ]
}
```

**Deploy**:
```bash
cd acchu-mobile-fork/packages/customer-system
vercel --prod
```

## 🎯 After Deployment

### Update QR Code in Electron App

The QR code will now show:
```
https://acchu-print.vercel.app
```

Instead of:
```
http://192.168.1.100:3003
```

### Benefits:
- ✅ Works from anywhere (not just WiFi)
- ✅ Customers can scan from home
- ✅ No network restrictions
- ✅ Professional URL
- ✅ HTTPS secure

## 🔒 Security Considerations

### Production Checklist:

- [ ] Use HTTPS (automatic with Vercel/Railway)
- [ ] Add rate limiting
- [ ] Enable CORS properly
- [ ] Use environment variables
- [ ] Get Razorpay live keys (after KYC)
- [ ] Add authentication (optional)
- [ ] Monitor errors (Sentry)
- [ ] Set up analytics

## 💰 Cost Estimate

### Free Tier (Good for Testing):
- **Vercel**: Free (100GB bandwidth/month)
- **Railway**: $5 free credit
- **Total**: $0-5/month

### Paid Tier (Production):
- **Vercel Pro**: $20/month
- **Railway**: ~$10/month
- **Total**: ~$30/month

## 📊 Deployment Checklist

### Before Deployment:
- [ ] Test locally
- [ ] Update environment variables
- [ ] Update CORS settings
- [ ] Build successfully
- [ ] No console errors

### During Deployment:
- [ ] Deploy backend first
- [ ] Get backend URL
- [ ] Deploy frontend with backend URL
- [ ] Get frontend URL
- [ ] Update Electron app

### After Deployment:
- [ ] Test backend API
- [ ] Test frontend UI
- [ ] Test file upload
- [ ] Test payment
- [ ] Test QR code
- [ ] Test complete flow

## 🐛 Common Issues

### Issue 1: CORS Error

**Error**: "Access-Control-Allow-Origin"

**Fix**: Add frontend URL to CORS whitelist in backend

### Issue 2: WebSocket Not Working

**Error**: WebSocket connection failed

**Fix**: Use WSS (secure WebSocket) in production

### Issue 3: Environment Variables Not Working

**Error**: API URL undefined

**Fix**: Prefix with `VITE_` for Vite apps

### Issue 4: Build Fails

**Error**: Build command failed

**Fix**: Check package.json scripts, install dependencies

## 🎯 Recommended Approach

### For Quick Testing:
1. Deploy to Vercel (both frontend + backend)
2. Use serverless functions
3. Test with QR code

### For Production:
1. Deploy backend to Railway (always-on)
2. Deploy frontend to Vercel (fast CDN)
3. Use custom domain
4. Enable monitoring

## 📝 Next Steps

1. **Choose deployment platform** (Vercel recommended)
2. **Create account** and connect GitHub
3. **Deploy backend** and get URL
4. **Deploy frontend** with backend URL
5. **Update Electron app** with deployed URLs
6. **Test QR code** - should work from anywhere!

---

**Status: ⏳ READY TO DEPLOY**

**Choose your deployment platform and follow the steps above!**

The QR code will work globally once deployed!
