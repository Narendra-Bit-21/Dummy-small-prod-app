const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Create ₹1 Razorpay order
router.post('/create-order', (req, res, next) => paymentController.createOrder(req, res, next));

// Verify Razorpay signature & update payment
router.post('/verify', (req, res, next) => paymentController.verifyPayment(req, res, next));

// Generate Direct NPCI UPI dynamic QR code for ₹1
router.post('/generate-upi-qr', (req, res, next) => paymentController.generateUpiQr(req, res, next));

// Confirm Direct UPI payment & auto-dispatch receipt
router.post('/confirm-direct-upi', (req, res, next) => paymentController.confirmDirectUpi(req, res, next));

// Payment transaction history
router.get('/history', (req, res, next) => paymentController.getHistory(req, res, next));

// Razorpay webhook
router.post('/webhook', (req, res, next) => paymentController.handleWebhook(req, res, next));

module.exports = router;
