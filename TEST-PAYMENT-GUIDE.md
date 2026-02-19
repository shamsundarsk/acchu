# Razorpay Test Payment Guide

## ✅ Your Razorpay Test Keys Configured

```
Key ID: rzp_test_SHyqdh9pk7Lsdg
Key Secret: fDqiR9CgykaMrdQNzi0QHLDI
```

These keys are already configured in your `.env` files!

## How to Test Payments

### Step 1: Start the Backend

```bash
cd acchu-mobile-fork/packages/customer-system
npm install
npm run dev
```

Backend will run on: `http://localhost:3001`

### Step 2: Start the Electron App

```bash
cd acchu-mini-app
npm install
npm start
```

### Step 3: Test Customer Flow

1. Open browser: `http://localhost:3001`
2. Upload a file (PDF, image, or document)
3. Select print options:
   - Copies: 2
   - Color: B&W or Color
   - Duplex: Yes/No
   - Paper: A4
4. Click "Proceed to Pay"
5. Razorpay checkout will open

### Step 4: Use Test Payment Methods

Razorpay provides these test credentials that ALWAYS work:

#### Test UPI IDs:
- `success@razorpay` - Payment will succeed
- `failure@razorpay` - Payment will fail

#### Test Credit/Debit Cards:
- **Card Number**: `4111 1111 1111 1111` (Visa)
- **Card Number**: `5555 5555 5555 4444` (Mastercard)
- **CVV**: Any 3 digits (e.g., `123`)
- **Expiry**: Any future date (e.g., `12/25`)
- **Name**: Any name (e.g., `Test User`)

#### Test Wallets:
All wallets work in test mode:
- Paytm
- PhonePe
- Google Pay
- Amazon Pay

Just select any wallet and it will simulate success.

#### Test Net Banking:
Select any bank from the list - all work in test mode.

### Step 5: Verify in Electron App

After successful payment:
1. Check the Electron app
2. You'll see the job with "✓ Paid" badge
3. Click "🖨️ PRINT NOW" button
4. Job will be sent to printer

## Test Scenarios

### Scenario 1: Successful UPI Payment
1. Upload file
2. Select options
3. Click "Proceed to Pay"
4. Enter UPI ID: `success@razorpay`
5. Payment succeeds
6. Job appears in Electron app with "✓ Paid"

### Scenario 2: Successful Card Payment
1. Upload file
2. Select options
3. Click "Proceed to Pay"
4. Select "Card" payment method
5. Enter:
   - Card: `4111 1111 1111 1111`
   - CVV: `123`
   - Expiry: `12/25`
   - Name: `Test User`
6. Click "Pay"
7. Payment succeeds
8. Job appears in Electron app

### Scenario 3: Failed Payment
1. Upload file
2. Select options
3. Click "Proceed to Pay"
4. Enter UPI ID: `failure@razorpay`
5. Payment fails
6. Error message shown
7. Job stays in "⏳ Awaiting Payment" status

## Razorpay Test Dashboard

View all test transactions:
1. Go to: https://dashboard.razorpay.com/test/dashboard
2. Login with your Razorpay account
3. See all test payments, orders, and transactions
4. No real money is charged in test mode

## Important Notes

### Test Mode Features:
- ✅ All payment methods work
- ✅ No real money is charged
- ✅ Unlimited test transactions
- ✅ Full payment flow simulation
- ✅ Webhook testing available
- ✅ No KYC required for test mode

### Test Mode Limitations:
- ❌ Can't receive real money
- ❌ Can't use in production
- ❌ Test transactions don't appear in live dashboard

### When to Switch to Live Mode:
1. Complete KYC verification (PAN card, bank details)
2. Get live API keys (starts with `rzp_live_`)
3. Update `.env` with live keys
4. Test thoroughly before going live
5. Enable webhooks for production

## Troubleshooting

### Payment Popup Not Opening
- Check browser console for errors
- Verify Razorpay script loaded
- Check if popup blocker is enabled
- Try different browser

### Payment Verification Failed
- Check backend logs
- Verify API keys are correct
- Check network connectivity
- Ensure backend is running

### Job Not Appearing in Electron App
- Check WebSocket connection (green dot)
- Verify backend is running
- Check Electron app console logs
- Restart Electron app

## Testing Checklist

- [ ] Backend starts successfully
- [ ] Electron app connects (green dot)
- [ ] Customer can upload file
- [ ] Print options work
- [ ] Pricing calculates correctly
- [ ] Razorpay checkout opens
- [ ] Test UPI payment succeeds
- [ ] Test card payment succeeds
- [ ] Payment verification works
- [ ] Job appears in Electron app with "✓ Paid"
- [ ] "PRINT NOW" button works
- [ ] Job sent to printer successfully

## Quick Test Commands

```bash
# Terminal 1: Start Backend
cd acchu-mobile-fork/packages/customer-system
npm run dev

# Terminal 2: Start Electron App
cd acchu-mini-app
npm start

# Terminal 3: Check logs
tail -f acchu-mobile-fork/packages/customer-system/logs/*.log
```

## Payment Flow Diagram

```
Customer Browser
    ↓
Upload File + Select Options
    ↓
Click "Proceed to Pay"
    ↓
Razorpay Checkout Opens
    ↓
Enter Test Credentials
    ↓
Payment Processed
    ↓
Backend Verifies Signature
    ↓
WebSocket Notification
    ↓
Electron App Updates
    ↓
Shop Owner Clicks "PRINT NOW"
    ↓
Job Sent to Printer
```

## Support

- **Razorpay Test Docs**: https://razorpay.com/docs/payments/payments/test-card-details/
- **Razorpay Dashboard**: https://dashboard.razorpay.com/test/dashboard
- **API Reference**: https://razorpay.com/docs/api/

---

**Status: ✅ READY TO TEST**

Your Razorpay test keys are configured. Start the backend and Electron app, then test the complete payment flow!
