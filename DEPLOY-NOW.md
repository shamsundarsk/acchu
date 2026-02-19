# 🚀 Deploy ACCHU Print Shop - Step by Step

## Current Situation

You have two versions:
1. **customer-deploy/** - Simplified frontend-only version
2. **acchu-mobile-fork/packages/customer-system/** - Full system with backend + frontend

For the QR code to work globally with the Electron app, we need to deploy the **FULL SYSTEM** (option 2).

## 🎯 Quick Deployment Steps

### Step 1: Prepare the Code

The full customer system is in `acchu-mobile-fork/packages/customer-system/` and it's already configured with:
- ✅ Vercel.json
- ✅ Build scripts
- ✅ Razorpay integration
- ✅ WebSocket support
- ✅ File upload
- ✅ Payment processing

### Step 2: Deploy to Vercel (Easiest Method)

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to**: https://vercel.com
2. **Sign in** with your GitHub account
3. **Click**: "Add New..." → "Project"
4. **Import** your repository: `shamsundarsk/acchu`
5. **Configure Project**:
   ```
   Framework Preset: Other
   Root Directory: acchu-mobile-fork/packages/customer-system
   Build Command: npm run build
   Output Directory: dist/client
   Install Command: npm install
   ```

6. **Add Environment Variables** (click "Environment Variables"):
   ```
   RAZORPAY_KEY_ID = rzp_test_SHyqdh9pk7Lsdg
   RAZORPAY_KEY_SECRET = fDqiR9CgykaMrdQNzi0QHLDI
   NODE_ENV = production
   ```

7. **Click**: "Deploy"

8. **Wait**: 2-3 minutes for build to complete

9. **Copy your URL**: Will be something like:
   ```
   https://acchu-xxxxx.vercel.app
   ```

#### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Go to the customer system directory
cd acchu-mobile-fork/packages/customer-system

# Deploy
vercel --prod

# Follow the prompts and add environment variables when asked
```

### Step 3: Update Electron App with Deployed URL

After deployment, you'll get a URL like: `https://acchu-xxxxx.vercel.app`

Update `acchu-mini-app/main.js` around line 180:

```javascript
ipcMain.handle('generate-qr-code', async () => {
    try {
        // REPLACE THIS:
        // const customerUrl = `http://${localIP}:3003`;
        
        // WITH YOUR DEPLOYED URL:
        const customerUrl = 'https://acchu-xxxxx.vercel.app'; // <-- Your Vercel URL
        
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

Or better yet, create `acchu-mini-app/.env`:
```env
FRONTEND_URL=https://acchu-xxxxx.vercel.app
BACKEND_URL=https://acchu-xxxxx.vercel.app
```

And update the code to use environment variables:
```javascript
const customerUrl = process.env.FRONTEND_URL || `http://${localIP}:3003`;
```

### Step 4: Test Everything

1. **Test the deployed site**:
   - Open `https://acchu-xxxxx.vercel.app` in browser
   - Should see the customer interface

2. **Test the Electron app**:
   - Open the Electron app
   - Click "Show QR Code"
   - Should show your deployed URL

3. **Test with phone**:
   - Scan QR code with phone
   - Should open the deployed site
   - Upload a file
   - Select print options
   - Complete payment
   - Check Electron app for the print job

## 🔧 Troubleshooting

### Build Fails on Vercel

**Error**: "Build failed"

**Solution**:
1. Check the build logs in Vercel dashboard
2. Make sure all dependencies are in package.json
3. Test build locally first:
   ```bash
   cd acchu-mobile-fork/packages/customer-system
   npm install
   npm run build
   ```

### Environment Variables Not Working

**Error**: "RAZORPAY_KEY_ID is undefined"

**Solution**:
1. Go to Vercel Dashboard
2. Select your project
3. Settings → Environment Variables
4. Add the variables
5. Redeploy (Deployments → Redeploy)

### CORS Errors

**Error**: "Access-Control-Allow-Origin"

**Solution**: The backend is already configured with CORS. If you still see errors, update `src/server/index.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:3003',
    'https://acchu-xxxxx.vercel.app', // Add your deployed URL
    'https://your-custom-domain.com'
  ]
}));
```

### WebSocket Not Working

Vercel has limitations with WebSockets. For production, consider:

**Option 1**: Deploy backend separately to Railway/Render
**Option 2**: Use HTTP polling instead of WebSocket

For now, the system should work with Vercel's serverless functions.

## 📊 What You'll Get

After deployment:

✅ **Global Access**: QR code works from anywhere
✅ **HTTPS**: Secure connection
✅ **Fast**: Vercel's CDN
✅ **Free**: Vercel free tier is generous
✅ **Auto-Deploy**: Push to GitHub = auto-deploy

## 🎯 Next Steps

1. **Deploy to Vercel** (follow Option A above)
2. **Get your URL** from Vercel
3. **Tell me the URL** so I can update the Electron app
4. **Test the complete flow**

## 💡 Custom Domain (Optional)

If you want a custom domain like `print.yourdomain.com`:

1. Go to Vercel Dashboard
2. Select your project
3. Settings → Domains
4. Add your domain
5. Follow DNS configuration instructions

---

**Ready to deploy?** 

Just follow Option A above and let me know your deployed URL!
