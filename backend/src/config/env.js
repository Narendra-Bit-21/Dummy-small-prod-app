const path = require('path');
const dotenv = require('dotenv');

// Load .env file from backend root or current directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  // Default to production so deploys that forget NODE_ENV never leak stack traces
  nodeEnv: process.env.NODE_ENV || 'production',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databasePath: process.env.DATABASE_PATH || path.resolve(__dirname, '../../../database/app.db'),
  autoNotifyOnPayment: process.env.AUTO_NOTIFY_ON_PAYMENT === 'true',

    // Cashfree Payments
  cashfree: {
    appId: process.env.CASHFREE_APP_ID || '',
    secretKey: process.env.CASHFREE_SECRET_KEY || '',
    env: process.env.CASHFREE_ENV || 'TEST',
    apiVersion: '2023-08-01',
    isConfigured: Boolean(
      process.env.CASHFREE_APP_ID &&
      process.env.CASHFREE_SECRET_KEY
    )
  },
  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    isConfigured: Boolean(
      process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      !process.env.RAZORPAY_KEY_ID.includes('placeholder')
    )
  },

  // Direct UPI
  upi: {
    vpa: process.env.UPI_VPA || 'ravi123sehravat@okaxis',
    payeeName: process.env.UPI_PAYEE_NAME || 'Ravi Sehrawat'
  },

  // Gmail SMTP
  gmail: {
    user: process.env.GMAIL_USER || 'ravi123sehravat@gmail.com',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.GMAIL_FROM_NAME || 'Payment & Alerts Hub',
    isConfigured: Boolean(
      process.env.GMAIL_USER &&
      process.env.GMAIL_APP_PASSWORD &&
      process.env.GMAIL_APP_PASSWORD.trim().length >= 8
    )
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    isConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      !process.env.TWILIO_ACCOUNT_SID.includes('xxxx')
    )
  },

  // Fast2SMS
  fast2sms: {
    apiKey: process.env.FAST2SMS_API_KEY || '',
    isConfigured: Boolean(process.env.FAST2SMS_API_KEY && process.env.FAST2SMS_API_KEY.trim().length > 10)
  },

  // Resend Email API
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    toOverride: process.env.RESEND_TO_OVERRIDE || '',
    isConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_'))
  },

  // Admin token for recipient write routes (empty = auth disabled)
  adminToken: process.env.ADMIN_TOKEN || ''
};

module.exports = config;
