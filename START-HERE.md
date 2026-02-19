# 🎯 START HERE - Complete Deployment Guide

## What We're Doing

Deploying your ACCHU Print Shop system so the QR code works globally (not just on local WiFi).

## Current Status

✅ Code is ready
✅ Razorpay integrated (test keys configured)
✅ QR code feature implemented
✅ Electron app working locally
⏳ Need to deploy to make it work globally

## 🚀 3-Step Deployment Process

### Step 1: Deploy to Vercel (5 minutes)

1. **Open**: https://vercel.com
2. **Sign in** with GitHub
3. **Click**: "Add New..." → "Project"
4. **Import**: Your repo `shamsundarsk/acchu`
5. **Configure**:
   ```
   Framework Preset: Other
   Root Directory: acchu-mobile-fork/packages/customer-system
   Build Command: npm run build
   Output Directory: dist/client
   Install Command: npm install
   ```
6. **Environment Variables** (click "Add"):
   ```
   RAZORPAY_KEY_ID = rzp_test_SHyqdh9pk7Lsdg
   RAZORPAY_KEY_SECRET = fDqiR9CgykaMrdQNzi0QHLDI
   NODE_ENV = production
   ```
7. **Click**: "Deploy"
8. **Wait**: 2-3 minutes
9. **Copy URL**: You'll get something like `https://acchu-xxxxx.vercel.app`

### Step 2: Update Electron App (2 minutes)

After you get your Vercel URL, run this command:

**On Mac/Linux**:
```bash
./update-electron-url.sh
```

**On Windows**:
```bash
update-electron-url.bat
```

Or manually update `acchu-mini-app/main.js` line ~180:
```javascript
// Change this:
const customerUrl = `http://${localIP}:3003`;

// To this (use your actual Vercel URL):
const customerUrl = 'https://acchu-xxxxx.vercel.app';
```

### Step 3: Test Everything (5 minutes)

1. **Restart Electron app**
2. **Click** "Show QR Code"
3. **Scan** with phone (from anywhere!)
4. **Upload** a test file
5. **Select** print options
6. **Pay** with test card:
   ```
   Card: 4111 1111 1111 1111
   Expiry: Any future date
   CVV: Any 3 digits
   ```
7. **Check** Electron app for print job
8. **Click** "Print Now"

## 📋 What You Need

- GitHub account (you have: shamsundarsk)
- Vercel account (free - sign up with GitHub)
- Your repo: https://github.com/shamsundarsk/acchu.git
- 10 minutes of time

## 🎯 What You'll Get

After deployment:

✅ **Global QR Code**: Works from anywhere in the world
✅ **HTTPS**: Secure connection
✅ **Fast**: Vercel's global CDN
✅ **Free**: Generous free tier
✅ **Auto-Deploy**: Push to GitHub = auto-deploy

## 📁 Project Structure

```
acchu/
├── acchu-mini-app/              # Electron app (shop owner)
│   ├── main.js                  # Main process (update QR code here)
│   ├── renderer/                # UI
│   └── services/                # Printer service
│
├── acchu-mobile-fork/
│   └── packages/
│       └── customer-system/     # Deploy this to Vercel
│           ├── src/
│           │   ├── client/      # React frontend
│           │   └── server/      # Express backend
│           ├── vercel.json      # Vercel config
│           └── package.json     # Dependencies
│
└── customer-deploy/             # Simplified version (not used)
```

## 🔧 Troubleshooting

### "Build failed" on Vercel

1. Check build logs in Vercel dashboard
2. Verify `Root Directory` is set correctly
3. Test build locally:
   ```bash
   cd acchu-mobile-fork/packages/customer-system
   npm install
   npm run build
   ```

### "Environment variables not working"

1. Go to Vercel Dashboard
2. Your Project → Settings → Environment Variables
3. Add the Razorpay keys
4. Redeploy: Deployments → Redeploy

### "QR code still shows local IP"

1. Make sure you updated `acchu-mini-app/main.js`
2. Restart the Electron app completely
3. Check the QR code again

### "Payment not working"

1. Verify Razorpay keys in Vercel environment variables
2. Check browser console for errors
3. Make sure you're using test card: 4111 1111 1111 1111

## 💡 Tips

- **Test locally first**: Make sure everything works on localhost before deploying
- **Use test keys**: Don't use production Razorpay keys until you're ready
- **Check logs**: Vercel dashboard shows detailed logs if something fails
- **Incremental testing**: Test each step (deploy → QR → upload → payment → print)

## 📞 Need Help?

If you get stuck:

1. **Check the logs**: Vercel dashboard → Your project → Deployments → View logs
2. **Test locally**: Make sure it works on localhost first
3. **Verify URLs**: Make sure all URLs are correct (no typos)
4. **Environment variables**: Double-check they're set in Vercel

## 🎉 Success Checklist

- [ ] Deployed to Vercel
- [ ] Got deployment URL
- [ ] Updated Electron app
- [ ] QR code shows deployed URL
- [ ] Scanned QR with phone
- [ ] Uploaded file successfully
- [ ] Payment completed
- [ ] Print job appeared in Electron app
- [ ] Printed successfully

## 🚀 Ready?

**Start with Step 1** above and let me know when you have your Vercel URL!

---

**Your repo**: https://github.com/shamsundarsk/acchu.git
**Deploy folder**: `acchu-mobile-fork/packages/customer-system`
**Razorpay Test Keys**: Already configured ✅
