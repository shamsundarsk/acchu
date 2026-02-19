# 🚀 Vercel Deployment Instructions

## ✅ Everything is Ready for Deployment!

Your repo: https://github.com/shamsundarsk/acchu.git

## 📋 Pre-Deployment Checklist

All files have been prepared:
- ✅ `vercel.json` - Deployment configuration
- ✅ `.vercelignore` - Files to ignore
- ✅ `.gitignore` - Git ignore rules
- ✅ Build scripts updated
- ✅ Environment variables documented

## 🚀 Deployment Steps

### Step 1: Push to GitHub

```bash
# Add all changes
git add .

# Commit
git commit -m "Prepare for Vercel deployment"

# Push to your repo
git push origin main
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel Dashboard (Easiest)

1. **Go to Vercel**: https://vercel.com
2. **Sign in** with GitHub
3. **Click "New Project"**
4. **Import** your repo: `shamsundarsk/acchu`
5. **Configure Project**:
   - Framework Preset: `Other`
   - Root Directory: `acchu-mobile-fork/packages/customer-system`
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist/client`
   - Install Command: `npm install`

6. **Add Environment Variables**:
   ```
   RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
   RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI
   NODE_ENV=production
   ```

7. **Click "Deploy"**

#### Option B: Using Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Go to project directory
cd acchu-mobile-fork/packages/customer-system

# Deploy
vercel --prod

# Follow prompts:
# - Link to existing project? No
# - Project name: acchu-print (or your choice)
# - Directory: ./
# - Override settings? No
```

### Step 3: Configure Custom Domain (Optional)

If you have a custom domain:

1. Go to Vercel Dashboard
2. Select your project
3. Go to Settings → Domains
4. Add your domain
5. Follow DNS configuration instructions

### Step 4: Get Your Deployment URL

After deployment, Vercel will give you:
```
https://acchu-print.vercel.app
```
or
```
https://your-custom-domain.com
```

### Step 5: Update Electron App

Update `acchu-mini-app/.env`:
```env
# Replace with your deployed URL
BACKEND_URL=https://acchu-print.vercel.app
FRONTEND_URL=https://acchu-print.vercel.app
```

Update `acchu-mini-app/main.js` (line ~180):
```javascript
ipcMain.handle('generate-qr-code', async () => {
    try {
        // Use deployed URL instead of local IP
        const customerUrl = process.env.FRONTEND_URL || 'https://acchu-print.vercel.app';
        
        // Generate QR code
        const qrCodeDataUrl = await QRCode.toDataURL(customerUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        
        return {
            success: true,
            qrCode: qrCodeDataUrl,
            url: customerUrl
        };
    } catch (error) {
        console.error('QR code generation failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
});
```

### Step 6: Test Deployment

1. **Test Backend API**:
   ```bash
   curl https://your-app.vercel.app/api/health
   ```

2. **Test Frontend**:
   - Open: `https://your-app.vercel.app`
   - Should see customer interface

3. **Test QR Code**:
   - Open Electron app
   - Click "Show QR Code"
   - Scan with phone
   - Should open deployed site

## 🔧 Environment Variables Needed

Add these in Vercel Dashboard → Settings → Environment Variables:

```env
RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI
NODE_ENV=production
PORT=3001
```

## 📁 Project Structure for Vercel

```
acchu-mobile-fork/packages/customer-system/
├── src/
│   ├── client/          # Frontend (React + Vite)
│   │   ├── main.tsx
│   │   ├── index.html
│   │   └── ...
│   └── server/          # Backend (Express + WebSocket)
│       ├── index.ts
│       └── ...
├── dist/
│   ├── client/          # Built frontend (Vercel serves this)
│   └── server/          # Built backend (Vercel serverless)
├── vercel.json          # Vercel configuration
├── package.json
└── .vercelignore
```

## 🎯 What Vercel Will Do

1. **Build Frontend**: Run `npm run vercel-build`
2. **Serve Frontend**: From `dist/client` folder
3. **Deploy Backend**: As serverless function
4. **Route Requests**:
   - `/api/*` → Backend serverless function
   - `/*` → Frontend static files

## ⚠️ Important Notes

### WebSocket Limitations

Vercel serverless functions have limitations with WebSockets. For production, consider:

**Option 1: Use Vercel for Frontend Only**
- Deploy frontend to Vercel
- Deploy backend to Railway/Render (for WebSocket support)

**Option 2: Use Polling Instead**
- Replace WebSocket with HTTP polling
- Less real-time but works on Vercel

### Recommended Production Setup:

```
Frontend (Vercel)
    ↓
Backend (Railway)
    ↓
Electron App
```

## 🚀 Alternative: Deploy Backend to Railway

### Step 1: Deploy Backend to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Go to backend directory
cd acchu-mobile-fork/packages/customer-system

# Initialize
railway init

# Add environment variables
railway variables set RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
railway variables set RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI
railway variables set NODE_ENV=production

# Deploy
railway up
```

### Step 2: Get Railway URL

Railway will give you: `https://acchu-backend.railway.app`

### Step 3: Update Frontend

In `acchu-mobile-fork/packages/customer-system/src/client/`:

Create `.env.production`:
```env
VITE_API_URL=https://acchu-backend.railway.app
```

### Step 4: Deploy Frontend to Vercel

Now deploy frontend to Vercel (it will use Railway backend)

## 📊 Deployment Checklist

### Before Deployment:
- [x] vercel.json created
- [x] .vercelignore created
- [x] .gitignore updated
- [x] Build scripts configured
- [x] Environment variables documented
- [ ] Code pushed to GitHub
- [ ] Vercel account created

### During Deployment:
- [ ] Import repo to Vercel
- [ ] Configure root directory
- [ ] Add environment variables
- [ ] Deploy

### After Deployment:
- [ ] Test deployed URL
- [ ] Test API endpoints
- [ ] Test file upload
- [ ] Test payment
- [ ] Update Electron app
- [ ] Test QR code

## 🎯 Expected URLs

After deployment, you'll have:

**Frontend**: `https://acchu-print.vercel.app`
**Backend API**: `https://acchu-print.vercel.app/api`
**WebSocket**: `wss://acchu-print.vercel.app/ws` (may need Railway)

## 💡 Quick Deploy Command

```bash
# One command to deploy everything
cd acchu-mobile-fork/packages/customer-system && vercel --prod
```

## 🐛 Troubleshooting

### Build Fails

**Error**: "Build failed"

**Fix**:
1. Check build logs in Vercel dashboard
2. Verify all dependencies in package.json
3. Test build locally: `npm run build`

### Environment Variables Not Working

**Error**: "API key undefined"

**Fix**:
1. Add variables in Vercel dashboard
2. Redeploy after adding variables

### CORS Error

**Error**: "Access-Control-Allow-Origin"

**Fix**: Update CORS in `src/server/index.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:3003',
    'https://acchu-print.vercel.app', // Your deployed URL
    'https://your-custom-domain.com'
  ]
}));
```

---

**Status: ✅ READY TO DEPLOY**

**Next Step**: Push to GitHub and deploy to Vercel!

Your QR code will work globally once deployed!
