# 🚀 Deployment Instructions for ACCHU Print Shop

## Current Status
✅ Code is ready for deployment
✅ Razorpay integration configured
✅ QR code feature implemented
✅ Electron app ready

## Your Repository
https://github.com/shamsundarsk/acchu.git

## 📋 What You Need to Provide

Before we deploy, please provide:
1. **Domain name** you want to use (or we'll use Vercel's auto-generated domain)
2. **Confirm** you want to deploy the customer system from `acchu-mobile-fork/packages/customer-system`

## 🎯 Deployment Options

### Option 1: Deploy Customer System to Vercel (Recommended)

This will deploy your customer web interface globally so the QR code works from anywhere.

#### Step 1: Push Code to Your GitHub Repo

Since `acchu-mobile-fork` is pointing to a different repo, we have two options:

**Option A: Copy customer-system to your main repo**
```bash
# Copy the customer system to your main repo
cp -r acchu-mobile-fork/packages/customer-system ./customer-deploy

# Add to git
git add customer-deploy
git commit -m "Add customer system for deployment"
git push origin main
```

**Option B: Change the remote of acchu-mobile-fork**
```bash
cd acchu-mobile-fork
git remote set-url origin https://github.com/shamsundarsk/acchu.git
git push origin main
```

#### Step 2: Deploy to Vercel

1. **Go to**: https://vercel.com
2. **Sign in** with GitHub
3. **Click**: "New Project"
4. **Import**: `shamsundarsk/acchu` repository
5. **Configure**:
   - Framework Preset: `Other`
   - Root Directory: `customer-deploy` (or `acchu-mobile-fork/packages/customer-system`)
   - Build Command: `npm run build`
   - Output Directory: `dist/client`
   - Install Command: `npm install`

6. **Environment Variables**:
   ```
   RAZORPAY_KEY_ID=rzp_test_SHyqdh9pk7Lsdg
   RAZORPAY_KEY_SECRET=fDqiR9CgykaMrdQNzi0QHLDI
   NODE_ENV=production
   ```

7. **Click**: "Deploy"

8. **Wait**: 2-3 minutes

9. **Get URL**: Something like `https://acchu-xxxx.vercel.app`

### Option 2: Use Ngrok (Current Setup)

You're currently using ngrok: `https://unskewed-krystin-syzygial.ngrok-free.dev`

This works but:
- ❌ URL changes every time you restart ngrok
- ❌ Requires keeping your computer running
- ❌ Free tier has limitations

## 🔧 After Deployment

Once you have your deployed URL (from Vercel or your custom domain), update the Electron app:

### Update acchu-mini-app/main.js

Find line ~180 and change:
```javascript
// OLD (uses local IP)
const customerUrl = `http://${localIP}:3003`;

// NEW (uses deployed URL)
const customerUrl = 'https://your-deployed-url.vercel.app';
```

Or create `acchu-mini-app/.env`:
```env
FRONTEND_URL=https://your-deployed-url.vercel.app
BACKEND_URL=https://your-deployed-url.vercel.app
```

And update the code:
```javascript
const customerUrl = process.env.FRONTEND_URL || `http://${localIP}:3003`;
```

## 📱 Testing After Deployment

1. Open Electron app
2. Click "Show QR Code"
3. Scan with phone (from anywhere in the world!)
4. Upload file
5. Select print options
6. Pay with Razorpay test card
7. See job in Electron app
8. Click "Print Now"

## 🎯 What Happens Next

After you provide the domain name or confirm deployment:

1. I'll help you push the code to GitHub
2. Guide you through Vercel deployment
3. Update the Electron app with the deployed URL
4. Test the complete flow

## 💡 Quick Decision

**Do you want to:**
- A) Deploy to Vercel (recommended - works globally, free tier available)
- B) Keep using ngrok (temporary, requires computer running)
- C) Use a custom domain you already own

**Please provide:**
1. Your choice (A, B, or C)
2. If A: Any specific subdomain preference? (e.g., print.yourdomain.com)
3. If C: Your domain name

---

**Ready to deploy when you are!** 🚀
