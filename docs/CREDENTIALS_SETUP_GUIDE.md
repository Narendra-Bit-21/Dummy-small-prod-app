# 🔑 External Credentials & Integration Setup Guide

This guide walks you through gathering all necessary credentials for **₹1 Payments** and **Multi-Channel Notifications** (Email, WhatsApp, SMS, and Direct UPI).

---

## 📑 Table of Contents
1. [Razorpay Payment Gateway (Test & Live Mode)](#1-razorpay-payment-gateway)
2. [Direct NPCI UPI QR Fallback (Instant Settlement, 0% Fee, Zero KYC)](#2-direct-npci-upi-qr-fallback)
3. [Gmail SMTP Email Service (`ravi123sehravat@gmail.com`)](#3-gmail-smtp-email-service)
4. [Twilio WhatsApp & SMS Notifications](#4-twilio-whatsapp--sms-notifications)
5. [Fast2SMS Indian SMS Gateway (Optional)](#5-fast2sms-indian-sms-gateway-optional)
6. [Master `.env` Reference Table](#6-master-env-reference-table)

---

## 1. Razorpay Payment Gateway

Razorpay powers the modal checkout for Credit/Debit Cards, NetBanking, Wallets, and UPI.

### Instant Test Mode (No KYC Required - Ready in 60 Seconds)
Test mode allows you to simulate ₹1.00 payments immediately without submitting business registration or bank verification documents:

1. Go to [Razorpay Sign Up](https://dashboard.razorpay.com/signup) and create an account.
2. In the top navigation bar, ensure the environment toggle is set to **"Test Mode"**.
3. In the left sidebar, navigate to: **Account & Settings** -> **API Keys** (under *Website and App Settings*).
4. Click **"Generate Key"** (or **"Regenerate Key"**).
5. Copy your credentials:
   - **Key ID**: Starts with `rzp_test_...`
   - **Key Secret**: A 24-character alphanumeric string.
6. Add these to your `.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_test_YourKeyHere123
   RAZORPAY_KEY_SECRET=YourSecretKeyHere456
   ```

### Live Mode (Real ₹1 Settlement to Bank Account)
To collect real ₹1 payments from real customers and receive settlements:
1. Complete KYC in the Razorpay Dashboard (submit PAN, Aadhaar, and Bank Account details for payout).
2. Once approved, switch the top toggle from **Test Mode** to **Live Mode**.
3. Navigate to **Account & Settings** -> **API Keys** -> **Generate Live Key**.
4. Set:
   ```env
   RAZORPAY_KEY_ID=rzp_live_YourKeyHere123
   RAZORPAY_KEY_SECRET=YourLiveSecretKeyHere456
   ```
5. **Settlement Timeline**: In Live Mode, ₹1 payments settle into your linked bank account on a **T+2 banking days** schedule (or instant settlement if enabled in Razorpay dashboard).

### Razorpay Webhook Configuration (Automatic Server Verification)
Webhooks ensure that if a user closes their browser before the redirect callback finishes, your backend still records the payment and triggers notifications:
1. In Razorpay Dashboard, go to **Account & Settings** -> **Webhooks**.
2. Click **"Add New Webhook"**.
3. Webhook URL: `https://<your-domain-or-ip>/api/payment/webhook`
4. Secret: Choose a strong random string (e.g., `quickpay_secret_salt_2026`).
5. Active Events to select:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
6. Click **Save Webhook**.
7. Put the secret in your `.env`:
   ```env
   RAZORPAY_WEBHOOK_SECRET=quickpay_secret_salt_2026
   ```

### Razorpay Test Credentials Cheatsheet:
| Payment Method | Test Input Details |
| :--- | :--- |
| **Test UPI VPA** | `success@razorpay` (always succeeds) or `failure@razorpay` |
| **Test Cards** | Card Number: `4111 1111 1111 1111`, Expiry: Any future date, CVV: `123`, OTP: `123456` |
| **Test Netbanking** | Select any bank (e.g. HDFC/SBI) and choose "Success" on the mock portal |

---

## 2. Direct NPCI UPI QR Fallback

> [!TIP]
> **No merchant account? No problem!**
> If you do not want to register with a payment aggregator or wait for merchant KYC approval, use the **Direct NPCI UPI QR Mode**.

### How It Works:
1. You provide your personal Virtual Payment Address (VPA) / UPI ID (e.g., `ravi123sehravat@okaxis` or `ravi123sehravat@okhdfcbank`).
2. The application dynamically generates an NPCI standard UPI intent string and high-resolution QR code:
   ```
   upi://pay?pa=ravi123sehravat@okaxis&pn=Ravi%20Sehrawat&am=1.00&cu=INR&tn=Order-REF-9021
   ```
3. When the customer scans the QR code with **Google Pay, PhonePe, Paytm, or BHIM**:
   - Exactly ₹1.00 is transferred directly into your personal bank account.
   - **0% merchant transaction fees**.
   - **0 settlement waiting delay** (money arrives instantly in your bank).
4. The customer enters the 12-digit UPI UTR / Transaction Reference Number on the frontend to confirm, and the system logs the transaction and fires all receipt notifications!

### Configure in `.env`:
```env
UPI_VPA=ravi123sehravat@okaxis
UPI_PAYEE_NAME=Ravi Sehrawat
```

---

## 3. Gmail SMTP Email Service

To send automated, beautiful HTML email receipts from `ravi123sehravat@gmail.com`.

> [!WARNING]
> Google disabled "Less Secure Apps" in 2022. You **cannot** use your regular Gmail login password with Nodemailer. You must generate a dedicated **16-character Google App Password**.

### Step-by-Step Google App Password Generation:
1. Go to your [Google Account Dashboard](https://myaccount.google.com/).
2. In the left navigation, click **Security**.
3. Under *"How you sign in to Google"*, verify that **2-Step Verification** is turned **ON**. (If not, activate it first using your mobile phone).
4. In the search box at the top of Google Account, search for **"App Passwords"** (or click on 2-Step Verification, scroll down to the bottom, and click **App Passwords**).
5. In the **App name** field, enter: `QuickPay Studio EC2`.
6. Click **Create**.
7. Google displays a **16-character passkey** in a yellow box (e.g., `abcd efgh ijkl mnop`).
8. Copy this key (spaces do not matter) and paste it into your `.env`:

```env
GMAIL_USER=ravi123sehravat@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
GMAIL_FROM_NAME="Payment & Alerts Notification Hub"
```

### Gmail SMTP Technical Specifications:
- **Host**: `smtp.gmail.com`
- **Port**: `465` (SSL) or `587` (TLS)
- **Daily Quota**: 500 emails/day on free consumer Gmail accounts (more than enough for testing and production alert triggers).

---

## 4. Twilio WhatsApp & SMS Notifications

Twilio sends real-time WhatsApp receipts and SMS payment confirmations to customer mobile numbers.

### Step 1: Create a Twilio Free Trial Account
1. Sign up at [Twilio Free Trial](https://www.twilio.com/try-twilio).
2. Verify your email and personal phone number.
3. Twilio grants **$15.00+ in free trial credits** (no credit card required).

### Step 2: Retrieve API Credentials
1. On the [Twilio Console Dashboard](https://console.twilio.com/), look at the **Account Info** tile.
2. Copy:
   - **Account SID**: Starts with `AC...`
   - **Auth Token**: Alphanumeric secret.
3. Add to your `.env`:
   ```env
   TWILIO_ACCOUNT_SID=ACa1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   TWILIO_AUTH_TOKEN=your_32_character_twilio_token
   ```

### Step 3: Activate Twilio WhatsApp Sandbox
To send WhatsApp messages without waiting for WhatsApp Business Meta approval:
1. In the Twilio Console, go to: **Messaging** -> **Try it out** -> **Send a WhatsApp message**.
2. Twilio provides a sandbox number (usually `+1 415 523 8886`) and a join code (e.g., `join silver-gazelle`).
3. Open WhatsApp on your phone, send `join <your-code>` to `+1 415 523 8886`.
4. Twilio will reply with: *"You are all set!"*
5. Add to `.env`:
   ```env
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   ```

### Step 4: Configure Twilio SMS Phone Number
1. Under **Phone Numbers** -> **Manage** -> **Buy a number** (costs $0 from free trial balance).
2. Select a number with SMS capabilities.
3. Add to `.env`:
   ```env
   TWILIO_PHONE_NUMBER=+12015550123
   ```
*(Note: During Twilio trial mode, SMS can be sent to verified phone numbers added in Console -> Phone Numbers -> Verified Caller IDs).*

---

## 5. Fast2SMS Indian SMS Gateway (Optional)

If you prefer sending domestic Indian SMS via DLT/Quick SMS:
1. Sign up at [Fast2SMS](https://www.fast2sms.com/).
2. Fast2SMS provides ₹50 free testing balance on signup.
3. Go to **Dev API** -> Copy your **API Authorization Key**.
4. Configure in `.env`:
   ```env
   FAST2SMS_API_KEY=your_fast2sms_api_key_here
   ```

---

## 6. Master `.env` Reference Table

Here is the complete reference of all environment variables supported by the application:

| Variable Name | Required? | Default / Example Value | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `5000` | Port Node.js listens on internally |
| `NODE_ENV` | Optional | `production` | Environment mode (`production` or `development`) |
| `DATABASE_PATH` | Optional | `/app/database/app.db` | Absolute or relative path to SQLite database |
| `RAZORPAY_KEY_ID` | Recommended | `rzp_test_...` | Razorpay API Key ID (Test or Live) |
| `RAZORPAY_KEY_SECRET` | Recommended | `...` | Razorpay API Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | `quickpay_webhook_secret_key_123` | Secret for HMAC SHA256 webhook validation |
| `UPI_VPA` | **Required** | `ravi123sehravat@okaxis` | Personal UPI VPA receiving instant payments |
| `UPI_PAYEE_NAME` | **Required** | `Ravi Sehrawat` | Name displayed on customer UPI payment app |
| `GMAIL_USER` | **Required** | `ravi123sehravat@gmail.com` | Google email address used for sending |
| `GMAIL_APP_PASSWORD` | **Required** | `16-char app passkey` | Google App Password (NOT regular password) |
| `GMAIL_FROM_NAME` | Optional | `Payment & Alerts Hub` | Friendly display name on incoming emails |
| `TWILIO_ACCOUNT_SID` | Optional | `AC...` | Twilio Account SID for WhatsApp & SMS |
| `TWILIO_AUTH_TOKEN` | Optional | `...` | Twilio Auth Secret Token |
| `TWILIO_WHATSAPP_NUMBER`| Optional | `whatsapp:+14155238886` | Twilio WhatsApp sender number |
| `TWILIO_PHONE_NUMBER` | Optional | `+12015550123` | Twilio SMS sender number |
| `FAST2SMS_API_KEY` | Optional | `...` | Fast2SMS API Key for Indian mobile SMS |
