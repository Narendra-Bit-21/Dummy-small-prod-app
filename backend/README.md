# 💳 Multi-Channel Notification & ₹1 Payment Backend Service

Production-ready backend architecture delivering automated ₹1 payment collections and multi-channel instant notifications (Email, WhatsApp, SMS) to 2 designated stakeholder recipients.

---

## 🌟 Key Architecture Capabilities

1. **₹1 Razorpay Integration**:
   - Razorpay Order creation API initialized for ₹1 (100 paise).
   - HMAC SHA-256 webhook and signature verification.
   - Built-in sandbox simulation fallback if keys are pending.

2. **NPCI Direct UPI Dynamic QR Generator (Zero Gateway Fees)**:
   - Dynamic Base64 QR Code generation following official NPCI UPI Deep Link specifications (`upi://pay?pa=...&pn=...&am=1.00&cu=INR&tn=...`).
   - Deep-linking intent ready for one-tap launch on Google Pay, PhonePe, and Paytm.

3. **Multi-Channel Notification Dispatch**:
   - **Email**: Nodemailer configured with Gmail SMTP (SSL Port 465) for `ravi123sehravat@gmail.com` with responsive HTML branded templates.
   - **WhatsApp**: Twilio REST API (`whatsapp:+14155238886`) with instantaneous `wa.me` direct web intent fallback.
   - **SMS**: Twilio SMS API and Fast2SMS Indian gateway support.
   - **Unified Batch Sender**: Synchronously or asynchronously delivers to the 2 primary recipients across all or selected channels.

4. **Resilient Persistence Layer**:
   - Native SQLite storage (`database/app.db`).
   - Automatic zero-dependency JSON database engine fallback (`database/app.json`) if C++ build tools are missing on Windows.
   - Auto-seeding of initial recipient slots.
   - Transaction logging and notification audit history.

---

## 📁 Directory Layout

```
Dummy-small-prod-app/
├── backend/
│   ├── .env.example              # Environment variables template
│   ├── .env                      # Active runtime environment
│   ├── package.json              # Express, Razorpay, Nodemailer, QRCode, etc.
│   ├── server.js                 # HTTP server bootstrap & static file hosting
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js            # Environment loader & credential validators
│   │   ├── controllers/
│   │   │   ├── payment.controller.js
│   │   │   ├── notification.controller.js
│   │   │   └── recipient.controller.js
│   │   ├── db/
│   │   │   └── database.js       # SQLite + JSON fallback database manager
│   │   ├── middleware/
│   │   │   └── errorHandler.js   # Global error & 404 handlers
│   │   ├── routes/
│   │   │   ├── index.js          # API router entry point
│   │   │   ├── payment.routes.js
│   │   │   ├── notification.routes.js
│   │   │   ├── recipient.routes.js
│   │   │   └── health.routes.js
│   │   └── services/
│   │       ├── payment.service.js
│   │       └── notification.service.js
│   └── test/
│       └── health-check.js       # End-to-end integration test suite
└── database/
    ├── schema.sql                # Standalone SQL schema definitions
    └── seeds.sql                 # Standalone SQL seed queries
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Server
PORT=5000

# NPCI Direct UPI QR Settings
UPI_VPA=ravi123sehravat@okaxis
UPI_PAYEE_NAME=Ravi Sehrawat

# Gmail SMTP (App Password)
GMAIL_USER=ravi123sehravat@gmail.com
GMAIL_APP_PASSWORD=your_16_char_google_app_password

# Razorpay (Optional for live orders)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...

# Twilio (Optional for live WhatsApp & SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

### 3. Start the Server
```bash
npm start
# Or for live file watching
npm run dev
```

---

## 📡 REST API Reference

### Health Check
- **`GET /api/health`**
  - Returns service status, database engine, record counts, and credential statuses.

### Payments
- **`POST /api/payment/create-order`**
  - **Body**: `{ "amount": 1.00, "currency": "INR", "notes": {} }`
  - Creates a Razorpay order for ₹1.
- **`POST /api/payment/verify`**
  - **Body**: `{ "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "...", "notifyRecipients": true }`
  - Verifies HMAC signature, records transaction, and optionally triggers notifications.
- **`POST /api/payment/generate-upi-qr`**
  - **Body**: `{ "amount": 1.00, "payeeVpa": "ravi123sehravat@okaxis", "payeeName": "Ravi Sehrawat", "transactionNote": "₹1 Payment" }`
  - Generates Base64 QR code image and raw UPI intent deep link.
- **`GET /api/payment/history?limit=50`**
  - Retrieves transaction records.
- **`POST /api/payment/webhook`**
  - Receives asynchronous webhook callbacks from Razorpay.

### Recipients Management
- **`GET /api/recipients`**
  - Lists the 2 configured recipients.
- **`PUT /api/recipients/:id`**
  - **Body**: `{ "name": "...", "email": "...", "phone": "...", "whatsapp": "..." }`
  - Updates recipient contact information.

### Notifications
- **`POST /api/notifications/send`**
  - **Body**:
    ```json
    {
      "channels": ["email", "whatsapp", "sms"],
      "subject": "Payment Received: ₹1.00",
      "message": "Transaction of ₹1.00 has been verified.",
      "metadata": {
        "Order_ID": "order_123",
        "Amount": "₹1.00"
      }
    }
    ```
- **`GET /api/notifications/history?limit=100`**
  - Retrieves notification audit logs with delivery statuses.

---

## 🧪 Testing & Verification

Run the comprehensive integration test suite:
```bash
npm test
```
The test verifies:
- Database initialization and pre-seeding
- Recipient record updates
- NPCI UPI QR code generation and URI compliance
- ₹1 Razorpay order generation & HMAC signature verification
- Batch notification dispatch and audit logging
