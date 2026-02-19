# ACCHU System - Vercel Deployment Guide

## Step 1: Get your ngrok URL
1. Open a new terminal
2. Run: `ngrok http 8080`
3. Copy the HTTPS URL (something like `https://abc123.ngrok.io`)

## Step 2: Update environment variables
Replace `YOUR_NGROK_URL_HERE` in these files with your ngrok URL:
- `frontend-web/.env`
- `acchu-mobile-fork/packages/customer-system/.env`

## Step 3: Deploy to Vercel

### Deploy Frontend Web (Shopkeeper Dashboard)
```bash
cd frontend-web
npx vercel --prod
```

### Deploy Customer System
```bash
cd acchu-mobile-fork/packages/customer-system
npx vercel --prod
```

## Step 4: Test the deployment
1. Keep your local AcchuSandboxEngine running
2. Keep ngrok running
3. Test the deployed URLs

## Important Notes:
- Your backend must stay running locally
- Keep ngrok running (don't close the terminal)
- The ngrok URL changes every time you restart it
- If ngrok URL changes, update the .env files and redeploy

## Deployment URLs:
After deployment, you'll get URLs like:
- Shopkeeper Dashboard: `https://your-project.vercel.app`
- Customer Interface: `https://your-customer-system.vercel.app`

## Demo Flow:
1. Show shopkeeper dashboard at your Vercel URL
2. Generate a session (or use a test session)
3. Show customer interface: `https://your-customer-system.vercel.app/session/test-session-123`
4. Upload files through customer interface
5. Show files appearing in shopkeeper dashboard
6. Execute print job from shopkeeper dashboard