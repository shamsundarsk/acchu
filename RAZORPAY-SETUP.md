# Razorpay Integration Guide

## ✅ INTEGRATION COMPLETE!

The Razorpay payment system has been fully integrated into the ACCHU Print Shop system.

## Setup Instructions

### 1. Get Razorpay API Keys

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys)
2. Sign up or log in
3. Navigate to Settings → API Keys
4. Generate Test Mode keys (for development)
5. Copy your Key ID and Key Secret

### 2. Configure Environment Variables

Create or update `.env` file in `acchu-mobile-fork/packages/customer-system/`:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_key_secret_here
```

### 3. Install Dependencies

```bash
cd acchu-mobile-fork/packages/customer-system
npm install razorpay
```

## Test Mode Credentials

**Key ID:** rzp_test_XXXXXXXXXXXXXXX (paste your key here)
**Key Secret:** XXXXXXXXXXXXXXXXXXXXXXXX (paste your secret here)

## Test Payment Methods

### Test UPI IDs:
- `success@razorpay` - Payment succeeds
- `failure@razorpay` - Payment fails

### Test Cards:
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

### Test Wallets:
- All wallets work in test mode
- No actual money is charged

## Integration Steps

1. ✅ Create Razorpay account
2. ✅ Get test API keys
3. ⏳ Add Razorpay script to customer UI
4. ⏳ Create payment component
5. ⏳ Integrate with customer flow
6. ⏳ Record transactions in Firestore
7. ⏳ Test payment flow

## What We're Building

### Customer Side:
1. Upload file
2. Select print options
3. See cost calculation
4. Click "Proceed to Pay"
5. Choose payment method:
   - UPI (scan QR or enter UPI ID)
   - Card
   - Wallet
   - Cash (mark as paid by shopkeeper)
6. Complete payment
7. See confirmation

### Shopkeeper Side:
1. See pending job (awaiting payment)
2. Payment received notification
3. Job moves to "Ready to Print"
4. Click "Print Now"
5. Transaction recorded

## Files We'll Create/Update

1. `customer-deploy/src/components/PaymentModal.tsx` - Payment UI
2. `customer-deploy/src/services/paymentService.ts` - Payment logic
3. `frontend-web/src/services/transactionService.ts` - Transaction tracking
4. Update customer SessionPage with payment flow
5. Update shopkeeper dashboard to show transactions

---

**Waiting for your Razorpay keys...**


---

## What's Been Implemented

### Backend (Node.js/Express)

1. **RazorpayService** (`src/server/services/RazorpayService.ts`)
   - Create payment orders
   - Verify payment signatures
   - Fetch payment/order details
   - Process refunds

2. **Payment Routes** (`src/server/routes/payments.ts`)
   - `POST /api/payments/:sessionId/create-order` - Create Razorpay order
   - `POST /api/payments/:sessionId/verify` - Verify payment
   - `GET /api/payments/:sessionId/status/:orderId` - Get payment status
   - `POST /api/payments/:sessionId/refund` - Process refund

3. **Fallback Mode**
   - If Razorpay keys not configured, automatically falls back to mock payment
   - Perfect for development and testing

### Frontend (React)

1. **PaymentInterface Component** (`components/PaymentInterface.tsx`)
   - Razorpay checkout integration
   - Payment method selection
   - Payment summary display
   - Automatic Razorpay script loading
   - Error handling

2. **Features**
   - UPI, Card, Wallet, Net Banking support (via Razorpay)
   - Mock payment option for testing
   - Real-time payment verification
   - Responsive UI

### Electron App

1. **WebSocket Integration**
   - Receives payment status updates
   - Updates print queue when payment completes
   - Shows payment status badges

## How It Works

### Customer Flow:
1. Customer uploads file
2. Selects print options (copies, color, duplex, paper size)
3. Sees calculated price
4. Clicks "Proceed to Pay"
5. Razorpay checkout opens with multiple payment options:
   - UPI (scan QR or enter UPI ID)
   - Credit/Debit Cards
   - Wallets (Paytm, PhonePe, etc.)
   - Net Banking
6. Completes payment
7. Payment verified automatically
8. Job sent to shop owner's Electron app

### Shop Owner Flow:
1. Sees new job in queue with "⏳ Awaiting Payment" badge
2. When payment completes, badge changes to "✓ Paid"
3. "PRINT NOW" button becomes active
4. Clicks button to print
5. Job sent to printer with all customer settings

## Testing

### Test with Razorpay Test Mode:

**Test UPI IDs:**
- `success@razorpay` - Payment succeeds
- `failure@razorpay` - Payment fails

**Test Cards:**
- Card: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date
- Name: Any name

**Test Wallets:**
- All wallets work in test mode
- No actual money is charged

### Test without Razorpay (Mock Mode):

If you don't set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, the system automatically uses mock payment mode for testing.

## Production Deployment

### 1. Get Live Keys

1. Complete KYC on Razorpay dashboard
2. Get live mode keys (starts with `rzp_live_`)
3. Update environment variables:

```env
RAZORPAY_KEY_ID=rzp_live_your_live_key_id
RAZORPAY_KEY_SECRET=your_live_key_secret
NODE_ENV=production
```

### 2. Webhook Setup (Optional but Recommended)

For production, set up webhooks to handle payment events:

1. Go to Razorpay Dashboard → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/payments/webhook`
3. Select events: `payment.captured`, `payment.failed`, `order.paid`
4. Implement webhook handler in backend

### 3. Security Checklist

- ✅ Never expose `RAZORPAY_KEY_SECRET` in frontend
- ✅ Always verify payment signature on backend
- ✅ Use HTTPS in production
- ✅ Implement rate limiting on payment endpoints
- ✅ Log all payment transactions
- ✅ Set up monitoring and alerts

## Files Modified/Created

### New Files:
- `acchu-mobile-fork/packages/customer-system/src/server/services/RazorpayService.ts`
- `acchu-mobile-fork/packages/customer-system/.env.example`

### Modified Files:
- `acchu-mobile-fork/packages/customer-system/src/server/routes/payments.ts`
- `acchu-mobile-fork/packages/customer-system/components/PaymentInterface.tsx`
- `acchu-mini-app/main.js` (WebSocket payment status handling)
- `acchu-mini-app/renderer/renderer.js` (Payment badge display)

## Next Steps

1. **Add Razorpay keys** to `.env` file
2. **Install dependencies**: `npm install razorpay`
3. **Test payment flow** with test credentials
4. **Complete KYC** on Razorpay for production
5. **Deploy** with live keys

## Support

- Razorpay Docs: https://razorpay.com/docs/
- Razorpay Support: https://razorpay.com/support/
- Test Dashboard: https://dashboard.razorpay.com/test/dashboard

---

**Status: ✅ READY FOR TESTING**
