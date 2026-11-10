const express = require('express');
const router = express.Router();
const config = require('../config/env');
const db = require('../db/database');

router.get('/', async (req, res) => {
  const uptime = process.uptime();
  const dbHealth = db.getHealth();

  let recipientCount = 0;
  let paymentCount = 0;
  try {
    const recipients = await db.getRecipients();
    recipientCount = recipients.length;
    const payments = await db.getPayments(100);
    paymentCount = payments.length;
  } catch (err) {
    // Ignore error for health check report
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    database: {
      engine: dbHealth.engine,
      storagePath: dbHealth.storagePath,
      records: {
        recipients: recipientCount,
        payments: paymentCount
      }
    },
    services: {
      razorpay: {
        configured: config.razorpay.isConfigured,
        keyIdPrefix: config.razorpay.keyId ? config.razorpay.keyId.substring(0, 8) + '...' : 'none'
      },
      upiDirect: {
        vpa: config.upi.vpa,
        payeeName: config.upi.payeeName,
        status: 'active'
      },
      emailGmail: {
        configured: config.gmail.isConfigured,
        user: config.gmail.user
      },
      whatsappTwilio: {
        configured: config.twilio.isConfigured,
        fromNumber: config.twilio.whatsappNumber,
        webFallback: 'active'
      },
      sms: {
        twilioConfigured: Boolean(config.twilio.isConfigured && config.twilio.phoneNumber),
        fast2smsConfigured: config.fast2sms.isConfigured
      }
    }
  });
});

module.exports = router;
