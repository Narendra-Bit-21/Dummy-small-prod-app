const express = require('express');
const router = express.Router();
const config = require('../config/env');

const paymentRoutes = require('./payment.routes');
const notificationRoutes = require('./notification.routes');
const recipientRoutes = require('./recipient.routes');
const healthRoutes = require('./health.routes');

// Server configuration metadata endpoint consumed by frontend
router.get('/config', (req, res) => {
  res.status(200).json({
    razorpay_key_id: config.razorpay.keyId || 'rzp_test_51MockKeyId99',
    sender_email: config.gmail.user || 'ravi123sehravat@gmail.com',
    environment: config.nodeEnv,
    upi_vpa: config.upi.vpa,
    payee_name: config.upi.payeeName
  });
});

router.use('/payment', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/recipients', recipientRoutes);
router.use('/health', healthRoutes);

module.exports = router;
