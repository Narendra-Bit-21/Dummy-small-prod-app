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

// Generate Razorpay-managed verified dynamic QR (QR Codes API)
router.post('/generate-razorpay-qr', (req, res, next) => paymentController.generateRazorpayQr(req, res, next));

// Poll Razorpay QR payment status (verified via webhook / fetchAllPayments)
router.get('/razorpay-qr-status/:qrId', (req, res, next) => paymentController.getRazorpayQrStatus(req, res, next));

// Generate Cashfree-managed verified dynamic UPI QR (order + qrcode session)
router.post('/generate-cashfree-qr', (req, res, next) => paymentController.generateCashfreeQr(req, res, next));

// Poll Cashfree QR payment status (verified via Cashfree order payments API / webhook)
router.get('/cashfree-qr-status/:orderId', (req, res, next) => paymentController.getCashfreeQrStatus(req, res, next));

// Cashfree webhook (separate route: different signature scheme from Razorpay)
router.post('/cashfree-webhook', (req, res, next) => paymentController.handleCashfreeWebhook(req, res, next));

// Payment transaction history
router.get('/history', (req, res, next) => paymentController.getHistory(req, res, next));

// Razorpay webhook
router.post('/webhook', (req, res, next) => paymentController.handleWebhook(req, res, next));

module.exports = router;
