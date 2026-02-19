# 🚀 ACCHU - Complete Development Plan

## Table of Contents
1. [Project Overview](#project-overview)
2. [Business Model](#business-model)
3. [Technical Architecture](#technical-architecture)
4. [Complete User Flow](#complete-user-flow)
5. [Development Roadmap](#development-roadmap)
6. [Implementation Details](#implementation-details)
7. [Deployment Strategy](#deployment-strategy)

---

## Project Overview

**ACCHU** - Secure Print-as-a-Service for Xerox Shops in India

### The Problem
- Millions of Indians use local xerox shops to print sensitive documents (Aadhaar, PAN cards, etc.)
- Files stay on shopkeeper's computer forever
- Massive privacy risk for customers
- No secure solution exists for unorganized retail sector

### The Solution
- Secure sandbox that isolates customer files
- Guaranteed complete deletion after printing
- No hardware changes needed - works on existing PCs
- Fail-closed security model (any error triggers immediate cleanup)

### Current Status
- ✅ Backend: .NET 8 AcchuSandboxEngine (running on localhost:8080)
- ✅ Frontend 1: Shopkeeper Dashboard (deployed on Vercel)
- ✅ Frontend 2: Customer UI (deployed on Vercel)
- ✅ All services running and connected via ngrok

---

## Business Model

### Target Market
- 500,000+ xerox shops in India
- Average shop: 50 print jobs/day
- Average ticket: ₹20/job

### Revenue Models

#### Option A: Subscription
- ₹499/month per shop
- Unlimited prints
- Target: 1000 shops in Year 1
- **Revenue: ₹71,88,000/year**

#### Option B: Transaction Fee
- ₹2 per print job
- Shop does 50 jobs/day = ₹100/day
- Target: 500 shops
- **Revenue: ₹1.8 Cr/year**

#### Option C: Hybrid (Recommended)
- ₹199/month base fee
- ₹1 per print job
- Shop does 50 jobs/day = ₹1500/month in transaction fees
- Total per shop: ₹1699/month
- Target: 500 shops
- **Revenue: ₹1.02 Cr/year**

### Competitive Advantages
- ✅ No hardware investment required
- ✅ Works on existing PCs
- ✅ 5-minute setup vs 2-day installation
- ✅ Enterprise-grade security
- ✅ Guaranteed data deletion
- ✅ Real-time monitoring

---

## Technical Architecture

### Current Architecture (Demo/MVP)

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL (Cloud)                       │
│  ┌──────────────────┐      ┌──────────────────┐       │
│  │  Shopkeeper      │      │  Customer UI     │       │
│  │  Dashboard       │      │  (Mobile Web)    │       │
│  │  (React/Vite)    │      │  (React/Vite)    │       │
│  └──────────────────┘      └──────────────────┘       │
└─────────────────────────────────────────────────────────┘
                 ↓                      ↓
┌─────────────────────────────────────────────────────────┐
│                    NGROK TUNNEL                         │
│              (Public URL to Local Backend)              │
└─────────────────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│              SHOP PC (Windows)                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  AcchuSandboxEngine (.NET 8)                     │  │
│  │  - Session Management                            │  │
│  │  - File System Sandbox                           │  │
│  │  - Print Manager                                 │  │
│  │  - Security Manager                              │  │
│  │  - Cleanup Manager                               │  │
│  └──────────────────────────────────────────────────┘  │
│                 ↓                                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Windows Print Spooler → Physical Printer        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Production Architecture (Future)

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUD SERVICES                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Firebase │  │  Backend │  │ Database │  │ Vercel │ │
│  │   Auth   │  │ (Azure/  │  │(Firebase/│  │Frontend│ │
│  │          │  │ Railway) │  │ MongoDB) │  │        │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
         ↓                ↓                ↓
    ┌────────┐      ┌─────────┐      ┌──────────┐
    │  Web   │      │Customer │      │  Local   │
    │Dashboard│     │   UI    │      │  Agent   │
    │        │      │         │      │(Shop PC) │
    └────────┘      └─────────┘      └──────────┘
         ↑               ↑                 ↑
    Shopkeeper      Customer's        Shopkeeper's
    (any device)    Phone             PC + Printer
```

---

## Complete User Flow

### PART 1: Shopkeeper Onboarding (One-time Setup)

#### Step 1: Registration
1. Shopkeeper visits website: `https://acchu-print.com`
2. Clicks "Register Your Shop"
3. Fills registration form:
   - Shop Name: "Ramesh Xerox"
   - Owner Name: "Ramesh Kumar"
   - Phone: 9876543210
   - Email: ramesh@gmail.com
   - Password: ********
   - Location: "Mumbai, Andheri"
4. Firebase creates account
5. Confirmation email sent
6. Auto-login to dashboard

#### Step 2: Setup (Current - No Mini App)
1. Dashboard shows setup instructions
2. Shopkeeper starts backend on shop PC
3. Configures ngrok tunnel
4. Updates environment variables
5. System ready to accept customers

#### Step 3: Setup (Future - With Mini App)
1. Dashboard shows: "Download Local Agent"
2. Downloads `ACCHU-Agent.exe` (50MB)
3. Runs installer → Installs to `C:\Program Files\ACCHU`
4. Agent auto-starts, asks for login
5. Shopkeeper enters email/password
6. Agent connects to cloud
7. Shows: "✓ Connected - Ready to print!"

### PART 2: Daily Operations

#### Morning - Shop Opens
```
┌─────────────────────────────────────┐
│  ACCHU Agent - Ramesh Xerox         │
│  ● Connected                        │
├─────────────────────────────────────┤
│  📊 TODAY'S STATS                   │
│  Prints: 0                          │
│  Revenue: ₹0                        │
│  Pending: 0                         │
├─────────────────────────────────────┤
│  🖨️ PRINTER STATUS                  │
│  HP LaserJet Pro - Ready            │
│  Paper: OK | Ink: 75%               │
├─────────────────────────────────────┤
│  📱 YOUR QR CODE                    │
│  [QR CODE IMAGE]                    │
│  Customers scan this                │
├─────────────────────────────────────┤
│  [View Full Dashboard] [Settings]   │
└─────────────────────────────────────┘
```

### PART 3: Customer Transaction Flow

#### Customer Side:
1. **Arrives at shop**: "I need to print"
2. **Scans QR code** with phone
3. **Opens customer UI** (no app install needed)
4. **Uploads file**: "Aadhaar_Card.pdf"
5. **Selects options**:
   - Copies: 2
   - Color: B&W
   - Pages: All
   - **Cost: ₹4**
6. **Proceeds to payment**
7. **Payment screen shows**:
   - UPI QR Code
   - OR "Pay Cash to Shop"
8. **Pays via UPI** or tells shopkeeper "Cash"
9. **Sees confirmation**: "✓ Payment confirmed - Your print is ready!"
10. **Waits at counter**
11. **Collects printout**

#### Shopkeeper Side:
1. **Shows QR code** (printed poster on wall)
2. **Agent notification**: "🔔 New customer connected"
3. **Web dashboard updates**: "Active session: 1"
4. **Agent shows**: "📄 File uploading..."
5. **File received**: "✓ Aadhaar_Card.pdf ready"
6. **Pending queue shows**:
   ```
   ┌──────────────────────┐
   │ PENDING PRINT JOB    │
   │ Aadhaar_Card.pdf     │
   │ 2 copies, B&W        │
   │ ₹4 - Awaiting payment│
   └──────────────────────┘
   ```
7. **Payment received**: "💰 Payment received ₹4" OR clicks "Mark as Cash Paid"
8. **Ready to print**:
   ```
   ┌──────────────────────┐
   │ READY TO PRINT       │
   │ Aadhaar_Card.pdf     │
   │ [🖨️ PRINT NOW]       │
   └──────────────────────┘
   ```
9. **Clicks "PRINT NOW"**
10. **File sent to printer** → Paper comes out!
11. **Agent shows**: "✓ Printed"
12. **Stats update**:
    - Prints: 0 → 1
    - Revenue: ₹0 → ₹4
13. **File auto-deleted** from:
    - Local PC
    - Cloud server
    - Customer's session

### PART 4: End of Day

```
┌─────────────────────────────┐
│ TODAY'S SUMMARY             │
│ Total Prints: 47            │
│ Revenue: ₹856               │
│ B&W: 38 | Color: 9          │
│                             │
│ PAYMENT BREAKDOWN           │
│ UPI: ₹620 (35 txns)        │
│ Cash: ₹236 (12 txns)       │
│                             │
│ [Download Report]           │
│ [View History]              │
└─────────────────────────────┘
```

---

## Development Roadmap

### Phase 1: MVP for Boss Demo (2-3 Days)

#### Day 1: Core Infrastructure
- [ ] **Firebase Authentication Setup**
  - Create Firebase project
  - Enable Email/Password auth
  - Get Firebase config
  - Integrate into frontend

- [ ] **Real Printer Integration**
  - Configure backend to use actual printer
  - Remove mock printer code
  - Test print flow end-to-end

- [ ] **Multi-Shop Support**
  - Add shop registration flow
  - Unique QR per shop
  - Session isolation per shop

#### Day 2: Payment & UI
- [ ] **Payment Integration**
  - Set up Razorpay test account
  - Add payment UI to customer interface
  - Payment confirmation flow
  - Cash payment option

- [ ] **Web Dashboard Redesign**
  - Transaction management UI
  - Real-time stats display
  - Print queue management
  - Professional styling

#### Day 3: Polish & Testing
- [ ] **Remove Demo Code**
  - Remove all "demo" references
  - Remove test/debug code
  - Professional error messages

- [ ] **Testing**
  - End-to-end testing
  - Error handling
  - Edge cases
  - Performance check

- [ ] **Demo Preparation**
  - Demo script
  - Backup plans
  - Presentation materials

### Phase 2: Production Ready (1-2 Weeks)

#### Week 1: Core Features
- [ ] Local Agent (Mini App)
  - Electron app setup
  - System tray integration
  - Print queue UI
  - Connection management
  - Installer creation

- [ ] Backend Deployment
  - Deploy to Azure/Railway
  - Database setup (MongoDB/Firebase)
  - Environment configuration
  - SSL certificates

- [ ] Advanced Features
  - Receipt generation
  - Email notifications
  - SMS integration
  - Report generation

#### Week 2: Scale & Polish
- [ ] Multi-location support
- [ ] Analytics dashboard
- [ ] Customer support system
- [ ] Marketing website
- [ ] Documentation
- [ ] Video tutorials

### Phase 3: Enterprise Features (1-2 Months)
- [ ] Mobile app (React Native)
- [ ] WhatsApp integration
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] API for integrations
- [ ] White-label options
- [ ] Franchise management

---

## Implementation Details

### 1. Firebase Authentication

#### Setup Steps:
1. Go to https://console.firebase.google.com/
2. Create project: "ACCHU-Production"
3. Enable Authentication → Email/Password
4. Get Firebase config from Project Settings

#### Frontend Integration:

**Install Dependencies:**
```bash
npm install firebase
```

**Create `src/config/firebase.ts`:**
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "acchu-production.firebaseapp.com",
  projectId: "acchu-production",
  storageBucket: "acchu-production.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

**Create `src/contexts/AuthContext.tsx`:**
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  shopData: ShopData | null;
  loading: boolean;
  signup: (email: string, password: string, shopData: ShopData) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface ShopData {
  shopName: string;
  ownerName: string;
  phone: string;
  location: string;
  createdAt: Date;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const shopDoc = await getDoc(doc(db, 'shops', user.uid));
        if (shopDoc.exists()) {
          setShopData(shopDoc.data() as ShopData);
        }
      } else {
        setShopData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signup = async (email: string, password: string, shopData: ShopData) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'shops', userCredential.user.uid), {
      ...shopData,
      createdAt: new Date(),
      userId: userCredential.user.uid
    });
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    shopData,
    loading,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
```

### 2. Real Printer Integration

#### Backend Configuration:

**Update `appsettings.json`:**
```json
{
  "Print": {
    "DefaultPrinterName": "HP LaserJet Pro",
    "MaxCopiesAllowed": 10,
    "AllowColorPrinting": true,
    "AllowDoubleSided": true,
    "PrintTimeoutSeconds": 300,
    "UseMockPrinter": false,  // Changed from true
    "MockPrintDelay": 3000,
    "MockPrinterName": ""
  }
}
```

**Get Printer Name:**
```powershell
Get-Printer | Select-Object Name
```

**Test Print:**
```csharp
// In PrintManager.cs
public async Task<PrintResult> PrintDocument(string filePath, PrintOptions options)
{
    try
    {
        var printerName = _configuration["Print:DefaultPrinterName"];
        
        // Use Windows Print Spooler
        var printDocument = new PrintDocument();
        printDocument.PrinterSettings.PrinterName = printerName;
        printDocument.PrinterSettings.Copies = (short)options.Copies;
        
        // Print the file
        printDocument.Print();
        
        return new PrintResult { Success = true };
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Print failed");
        return new PrintResult { Success = false, Error = ex.Message };
    }
}
```

### 3. Payment Integration (Razorpay)

#### Setup:
1. Sign up at https://razorpay.com/
2. Get Test API Keys from Dashboard → Settings → API Keys
3. Key ID: `rzp_test_xxxxx`
4. Key Secret: `xxxxx`

#### Frontend Integration:

**Install Razorpay:**
```bash
npm install razorpay
```

**Add to `index.html`:**
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

**Create Payment Component:**
```typescript
// src/components/PaymentInterface.tsx
import React from 'react';

interface PaymentProps {
  amount: number;
  onSuccess: (paymentId: string) => void;
  onFailure: (error: string) => void;
}

export const PaymentInterface: React.FC<PaymentProps> = ({ 
  amount, 
  onSuccess, 
  onFailure 
}) => {
  const handlePayment = () => {
    const options = {
      key: 'rzp_test_YOUR_KEY_ID',
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      name: 'ACCHU Print',
      description: 'Print Job Payment',
      handler: function (response: any) {
        onSuccess(response.razorpay_payment_id);
      },
      prefill: {
        name: 'Customer',
        email: 'customer@example.com',
        contact: '9999999999'
      },
      theme: {
        color: '#3399cc'
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.on('payment.failed', function (response: any) {
      onFailure(response.error.description);
    });
    rzp.open();
  };

  return (
    <div className="payment-interface">
      <h3>Payment Required</h3>
      <p>Amount: ₹{amount}</p>
      <button onClick={handlePayment}>Pay with UPI/Card</button>
      <button onClick={() => onSuccess('CASH')}>Pay Cash</button>
    </div>
  );
};
```

### 4. Transaction Management

#### Database Schema (Firestore):

**Collections:**

**shops:**
```json
{
  "shopId": "user_uid",
  "shopName": "Ramesh Xerox",
  "ownerName": "Ramesh Kumar",
  "phone": "9876543210",
  "email": "ramesh@gmail.com",
  "location": "Mumbai, Andheri",
  "createdAt": "2026-02-14T10:00:00Z",
  "isActive": true
}
```

**transactions:**
```json
{
  "transactionId": "txn_123456",
  "shopId": "user_uid",
  "sessionId": "session_abc",
  "fileName": "Aadhaar_Card.pdf",
  "copies": 2,
  "colorMode": "bw",
  "pages": "all",
  "amount": 4,
  "paymentMethod": "upi",
  "paymentId": "pay_xyz",
  "status": "completed",
  "createdAt": "2026-02-14T14:30:00Z",
  "printedAt": "2026-02-14T14:32:00Z"
}
```

**sessions:**
```json
{
  "sessionId": "session_abc",
  "shopId": "user_uid",
  "qrCode": "https://...",
  "status": "active",
  "createdAt": "2026-02-14T14:25:00Z",
  "expiresAt": "2026-02-14T15:25:00Z"
}
```

### 5. Web Dashboard Features

#### Pages to Build:

**1. Dashboard Home:**
- Today's stats (prints, revenue)
- Active sessions
- Pending print jobs
- Quick actions

**2. Transactions:**
- List all transactions
- Filter by date/payment method
- Export to CSV/PDF
- Search functionality

**3. Reports:**
- Daily/Weekly/Monthly reports
- Revenue charts
- Print statistics
- Payment breakdown

**4. Settings:**
- Shop profile
- Printer configuration
- Pricing settings
- QR code management

**5. Print Queue:**
- Real-time pending jobs
- Print button for each job
- Job details
- Status updates

---

## Deployment Strategy

### Current Setup (Demo):

**Frontend (Vercel):**
```bash
# Deploy shopkeeper dashboard
cd frontend-web
vercel --prod

# Deploy customer UI
cd customer-deploy
vercel --prod
```

**Backend (ngrok):**
```bash
# Start backend
cd src/AcchuSandboxEngine
dotnet run --urls=http://localhost:8080

# In another terminal
ngrok http 8080
```

**Update Environment Variables:**
```bash
# frontend-web/.env
VITE_API_BASE_URL=https://your-ngrok-url.ngrok-free.app

# customer-deploy/.env
VITE_API_BASE_URL=https://your-ngrok-url.ngrok-free.app
```

### Production Deployment:

#### Option 1: Azure (Recommended for .NET)

**Backend:**
```bash
# Install Azure CLI
# Login
az login

# Create resource group
az group create --name acchu-rg --location eastus

# Create App Service plan
az appservice plan create --name acchu-plan --resource-group acchu-rg --sku B1

# Create web app
az webapp create --name acchu-backend --resource-group acchu-rg --plan acchu-plan --runtime "DOTNET|8.0"

# Deploy
cd src/AcchuSandboxEngine
dotnet publish -c Release
az webapp deployment source config-zip --resource-group acchu-rg --name acchu-backend --src publish.zip
```

**Cost:** ~$13/month (B1 tier)

#### Option 2: Railway.app

1. Go to https://railway.app/
2. Connect GitHub repo
3. Select `src/AcchuSandboxEngine`
4. Railway auto-detects .NET
5. Deploy

**Cost:** ~$10-20/month

#### Option 3: Fly.io

```bash
# Install flyctl
# Login
fly auth login

# Launch app
cd src/AcchuSandboxEngine
fly launch

# Deploy
fly deploy
```

**Cost:** Free tier available

### Database Deployment:

**Firebase (Recommended):**
- Already set up with authentication
- Firestore for data
- Free tier: 50K reads/day, 20K writes/day
- Paid: Pay as you go

**MongoDB Atlas:**
- Free tier: 512MB storage
- Good for scaling
- Easy integration

---

## Testing Checklist

### Before Boss Demo:

#### Functional Testing:
- [ ] Shopkeeper can register
- [ ] Shopkeeper can login
- [ ] QR code generates correctly
- [ ] Customer can scan QR
- [ ] Customer can upload file
- [ ] File appears in shopkeeper dashboard
- [ ] Payment flow works (UPI + Cash)
- [ ] Print button triggers actual print
- [ ] File gets deleted after print
- [ ] Stats update correctly
- [ ] Transaction history shows correctly

#### UI/UX Testing:
- [ ] No "demo" or "test" text visible
- [ ] Professional branding
- [ ] Mobile responsive
- [ ] Fast loading times
- [ ] Clear error messages
- [ ] Intuitive navigation

#### Security Testing:
- [ ] Authentication works
- [ ] Sessions are isolated
- [ ] Files are deleted
- [ ] No data leaks
- [ ] HTTPS enabled

#### Performance Testing:
- [ ] Handles multiple customers
- [ ] Print queue doesn't lag
- [ ] File upload is fast
- [ ] Dashboard loads quickly

---

## Demo Script for Boss

### Introduction (1 minute)
"I want to show you ACCHU - a secure printing solution for xerox shops that solves a massive privacy problem in India."

### Problem Statement (1 minute)
"Right now, when you print your Aadhaar card at a local shop, that file stays on their computer forever. 500,000 shops, millions of sensitive documents, zero security."

### Solution Demo (5 minutes)

**1. Shopkeeper Setup (1 min):**
- "Here's how a shopkeeper signs up..."
- Show registration
- Show dashboard
- Show QR code

**2. Customer Experience (2 min):**
- "Customer walks in, scans this QR code..."
- Show mobile interface
- Upload sample file
- Select print options
- Show payment

**3. Printing (1 min):**
- "Shopkeeper sees the job..."
- Click print
- **ACTUAL PAPER COMES OUT**
- "And the file is immediately deleted"

**4. Business Dashboard (1 min):**
- Show transaction history
- Show daily stats
- Show reports

### Business Model (2 minutes)
"We can charge ₹199/month + ₹1 per print. With just 500 shops, that's ₹1 crore annual revenue."

### Ask (1 minute)
"I need approval to:
1. Deploy to production (₹5000/month)
2. Get 5 pilot customers
3. Build the mobile app
4. Hire one developer

Can we move forward?"

---

## Next Steps After Approval

### Week 1:
- [ ] Deploy to production (Azure)
- [ ] Get custom domain
- [ ] SSL certificates
- [ ] Production database

### Week 2:
- [ ] Find 5 pilot customers
- [ ] On-site installation
- [ ] Training & support
- [ ] Collect feedback

### Week 3:
- [ ] Build mini app (Electron)
- [ ] Improve based on feedback
- [ ] Add requested features
- [ ] Performance optimization

### Week 4:
- [ ] Marketing website
- [ ] Case studies
- [ ] Video tutorials
- [ ] Sales materials

### Month 2:
- [ ] Scale to 50 customers
- [ ] Hire support team
- [ ] Build mobile app
- [ ] Advanced features

---

## Resources & Links

### Documentation:
- Firebase: https://firebase.google.com/docs
- Razorpay: https://razorpay.com/docs/
- Electron: https://www.electronjs.org/docs
- .NET: https://learn.microsoft.com/en-us/dotnet/

### Tools:
- Vercel: https://vercel.com/
- ngrok: https://ngrok.com/
- Azure: https://portal.azure.com/
- Railway: https://railway.app/

### Current Deployment:
- Shopkeeper Dashboard: https://frontend-web-beta-wheat.vercel.app
- Customer UI: https://customer-deploy-[latest].vercel.app
- Backend: ngrok tunnel (changes each session)

---

## Contact & Support

For questions or issues during development, refer to:
- This document
- Code comments in the repository
- Firebase/Razorpay documentation
- .NET documentation

---

**Last Updated:** February 14, 2026
**Version:** 1.0
**Status:** Ready for Boss Demo

---

## Quick Commands Reference

### Start All Services:
```bash
# Terminal 1: Backend
cd src/AcchuSandboxEngine
dotnet run --urls=http://localhost:8080

# Terminal 2: ngrok
ngrok http 8080

# Terminal 3: Frontend Web (if running locally)
cd frontend-web
npm run dev

# Terminal 4: Customer UI (if running locally)
cd customer-deploy
npm run dev
```

### Deploy to Vercel:
```bash
# Update backend URL first
# Then deploy
cd frontend-web
vercel --prod

cd customer-deploy
vercel --prod
```

### Firebase Commands:
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init

# Deploy
firebase deploy
```

---

**END OF DOCUMENT**
