const paymentService = require('../services/payment.service');
const notificationService = require('../services/notification.service');
const db = require('../db/database');
const config = require('../config/env');
const crypto = require('crypto');

const MAX_AMOUNT_RUPEES = 100000;

function parseNotes(notes) {
  if (!notes) return {};
  if (typeof notes === 'object') return notes;
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

class PaymentController {
  /**
   * POST /api/payment/create-order
   * Create Razorpay order for ₹1 (or custom amount)
   */

  /**
   * POST /api/payment/create-cashfree-order
   * Create Cashfree order for ?1
   */
  async createCashfreeOrder(req, res, next) {
    try {
      const { amount = 1.00, customerPhone, customerEmail } = req.body;
      const order = await paymentService.createCashfreeOrder({
        amount,
        customerPhone,
        customerEmail
      });
      return res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  }
  async createOrder(req, res, next) {
    try {
      let { amount = 1.00, currency = 'INR', receipt, notes } = req.body;

      // Amount is always supplied in paise by the frontend (₹1 = 100 paise)
      const numAmount = Number(amount);
      if (
        !Number.isFinite(numAmount) ||
        !Number.isInteger(numAmount) ||
        numAmount < 100 ||
        numAmount > MAX_AMOUNT_RUPEES * 100
      ) {
        return res.status(400).json({
          success: false,
          message: `amount must be an integer in paise between 100 (₹1) and ${MAX_AMOUNT_RUPEES * 100} (₹${MAX_AMOUNT_RUPEES}).`
        });
      }
      const amountInRupees = numAmount / 100;

      const orderData = await paymentService.createRazorpayOrder({
        amount: amountInRupees,
        currency,
        receipt,
        notes
      });

      return res.status(200).json({
        success: true,
        order_id: orderData.orderId,
        id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency,
        key_id: orderData.keyId,
        receipt: orderData.receipt,
        data: orderData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/verify
   * Verify Razorpay checkout signature & optionally trigger notifications
   */
  async verifyPayment(req, res, next) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount,
        notifyRecipients = config.autoNotifyOnPayment
      } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id) {
        return res.status(400).json({
          success: false,
          message: 'Both razorpay_order_id and razorpay_payment_id are required.'
        });
      }

      // Idempotency: if the order is already paid, return existing data without re-dispatching
      const existingOrder = await db.getPaymentByOrderId(razorpay_order_id);
      if (existingOrder && existingOrder.status === 'paid') {
        return res.status(200).json({
          success: true,
          message: 'Payment already verified.',
          alreadyPaid: true,
          transaction: existingOrder,
          data: { verified: true, orderId: razorpay_order_id, payment: existingOrder },
          notificationsDispatched: null
        });
      }

      const verificationResult = await paymentService.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });

      if (!verificationResult.verified) {
        return res.status(400).json({
          success: false,
          message: verificationResult.message
        });
      }

      // Optionally dispatch notifications to the 2 recipients upon payment confirmation
      let dispatchSummary = null;
      if (notifyRecipients) {
        // Receipt amount comes from the DB order (rupees); fall back to client paise value only if missing
        const dbAmount = existingOrder && existingOrder.amount ? parseFloat(existingOrder.amount) : 0;
        const fallbackAmount = amount ? parseFloat(amount) / 100 : 0;
        const paidAmount = dbAmount > 0
          ? dbAmount
          : (Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : null);
        const amtStr = paidAmount ? `₹${paidAmount.toFixed(2)}` : '₹(amount)';
        try {
          dispatchSummary = await notificationService.sendToRecipients({
            subject: `Payment Confirmation: ${amtStr} Received`,
            message: `A payment of ${amtStr} was successfully processed!\nOrder ID: ${razorpay_order_id}\nPayment ID: ${razorpay_payment_id}`,
            amount: paidAmount,
            metadata: {
              Order_ID: razorpay_order_id,
              Payment_ID: razorpay_payment_id,
              Amount: amtStr,
              Status: 'Paid',
              Gateway: 'Razorpay'
            }
          });
        } catch (notifErr) {
          console.warn(`[PaymentController] Post-payment notification dispatch notice: ${notifErr.message}`);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified and recorded successfully.',
        transaction: verificationResult.payment,
        data: verificationResult,
        notificationsDispatched: dispatchSummary
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/generate-upi-qr
   * Generate Direct NPCI UPI dynamic QR code for ₹1 with 0 merchant fee
   */
  async generateUpiQr(req, res, next) {
    try {
      const {
        amount = 1.00,
        note,
        transactionNote = 'Dummy App Order ₹1'
      } = req.body;

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_AMOUNT_RUPEES) {
        return res.status(400).json({ success: false, message: 'Invalid amount.' });
      }

      // Payee details always come from server config; never trust client-supplied values
      const payeeVpa = config.upi.vpa;
      const payeeName = config.upi.payeeName;
      // Reference ID is generated server-side; client-supplied ref_id/orderId are ignored
      const ref_id = `UPI_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const upiResult = await paymentService.generateUpiQr({
        amount: numAmount,
        payeeVpa,
        payeeName,
        transactionNote: note || transactionNote,
        orderId: ref_id
      });

      return res.status(200).json({
        success: true,
        upi_string: upiResult.upiUri,
        qr_image_url: upiResult.qrCodeDataUrl,
        vpa: upiResult.payeeVpa,
        payee_name: upiResult.payeeName,
        reference_id: upiResult.orderId,
        amount: upiResult.amount.toFixed(2),
        upiUri: upiResult.upiUri,
        qrCodeDataUrl: upiResult.qrCodeDataUrl,
        data: upiResult
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/generate-razorpay-qr
   * Generate a Razorpay-managed dynamic UPI QR (QR Codes API). Payment is VERIFIED
   * via the qr_code.credited webhook, unlike the trust-based Direct UPI QR.
   */
  async generateRazorpayQr(req, res, next) {
    try {
      const { amount = 100, description } = req.body;

      // Amount is always supplied in paise by the frontend (₹1 = 100 paise) — same bounds as createOrder
      const numAmount = Number(amount);
      if (
        !Number.isFinite(numAmount) ||
        !Number.isInteger(numAmount) ||
        numAmount < 100 ||
        numAmount > MAX_AMOUNT_RUPEES * 100
      ) {
        return res.status(400).json({
          success: false,
          message: `amount must be an integer in paise between 100 (₹1) and ${MAX_AMOUNT_RUPEES * 100} (₹${MAX_AMOUNT_RUPEES}).`
        });
      }
      const amountInRupees = numAmount / 100;

      const qrData = await paymentService.createRazorpayQr({
        amount: amountInRupees,
        description: description || `QuickPay Verified QR — ₹${amountInRupees.toFixed(2)}`
      });

      // Razorpay not configured on the server: report clearly (503), never fake a QR
      if (!qrData.success) {
        return res.status(503).json(qrData);
      }

      return res.status(200).json({
        success: true,
        qr_id: qrData.qrId,
        qr_image_url: qrData.qrImageUrl,
        amount: qrData.amount,
        status: qrData.status,
        data: qrData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payment/razorpay-qr-status/:qrId
   * Poll whether a Razorpay QR has been paid (DB first, Razorpay fetchAllPayments fallback).
   */
  async getRazorpayQrStatus(req, res, next) {
    try {
      const { qrId } = req.params;
      if (!qrId) {
        return res.status(400).json({ success: false, message: 'qrId is required.' });
      }

      const result = await paymentService.getRazorpayQrStatus(qrId);

      return res.status(200).json({
        success: true,
        qr_id: qrId,
        status: result.status,
        paid: result.paid,
        payment_id: result.paymentId || null,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/generate-cashfree-qr
   * Generate a Cashfree-managed dynamic UPI QR (order + UPI qrcode session). Payment is VERIFIED
   * by polling Cashfree's order payments API (webhook is an optional fast path).
   */
  async generateCashfreeQr(req, res, next) {
    try {
      const { amount = 100, description } = req.body;

      // Amount is always supplied in paise by the frontend (₹1 = 100 paise) — same bounds as createOrder
      const numAmount = Number(amount);
      if (
        !Number.isFinite(numAmount) ||
        !Number.isInteger(numAmount) ||
        numAmount < 100 ||
        numAmount > MAX_AMOUNT_RUPEES * 100
      ) {
        return res.status(400).json({
          success: false,
          message: `amount must be an integer in paise between 100 (₹1) and ${MAX_AMOUNT_RUPEES * 100} (₹${MAX_AMOUNT_RUPEES}).`
        });
      }
      const amountInRupees = numAmount / 100;

      const qrData = await paymentService.createCashfreeQr({
        amount: amountInRupees,
        description: description || `QuickPay Cashfree QR — ₹${amountInRupees.toFixed(2)}`
      });

      // Cashfree not configured / API failure: report clearly (503), never fake a QR
      if (!qrData.success) {
        return res.status(503).json(qrData);
      }

      return res.status(200).json({
        success: true,
        order_id: qrData.orderId,
        cf_order_id: qrData.cfOrderId,
        qr_image_url: qrData.qrImageUrl,
        amount: qrData.amount,
        status: qrData.status,
        data: qrData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payment/cashfree-qr-status/:orderId
   * Poll whether a Cashfree QR order has been paid (DB first, Cashfree order payments API next).
   */
  async getCashfreeQrStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      if (!orderId || !/^[A-Za-z0-9_-]{1,50}$/.test(orderId)) {
        return res.status(400).json({ success: false, message: 'A valid orderId is required.' });
      }

      const result = await paymentService.getCashfreeQrStatus(orderId);

      // Auto-dispatch receipt only on the first poll tick that detects payment, and only when enabled
      if (result.newlyPaid && config.autoNotifyOnPayment) {
        const amtStr = Number.isFinite(result.amount) ? `₹${result.amount.toFixed(2)}` : '₹(amount)';
        try {
          await notificationService.sendToRecipients({
            subject: `Verified QR Payment: ${amtStr} Received (Cashfree)`,
            message: `A Cashfree-verified QR payment of ${amtStr} was received and confirmed.\nPayment ID: ${result.paymentId}\nOrder ID: ${orderId}`,
            metadata: {
              Payment_ID: result.paymentId,
              Order_ID: orderId,
              Amount: amtStr,
              Method: 'Cashfree Verified QR (UPI)',
              Status: 'Paid & Verified',
              Timestamp: new Date().toISOString()
            }
          });
          console.log(`[PaymentController] Cashfree poll auto-dispatched receipts for payment ${result.paymentId}`);
        } catch (notifErr) {
          console.warn(`[PaymentController] Cashfree poll notification dispatch notice: ${notifErr.message}`);
        }
      }

      return res.status(200).json({
        success: true,
        order_id: orderId,
        status: result.status,
        paid: result.paid,
        payment_id: result.paymentId || null,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/cashfree-webhook
   * Asynchronous Cashfree webhook handler (optional fast path; polling is authoritative)
   */
  async handleCashfreeWebhook(req, res, next) {
    try {
      const result = await paymentService.handleCashfreeWebhook({
        rawBody: req.rawBody,
        signature: req.headers['x-webhook-signature'],
        timestamp: req.headers['x-webhook-timestamp'],
        eventData: req.body
      });

      // Unverified webhook: do not process or dispatch anything
      if (result && result.verified === false) {
        return res.status(401).json(result);
      }

      // Auto-dispatch receipt only the first time a Cashfree QR order is marked paid, and only when enabled
      if (result && result.newlyPaid && config.autoNotifyOnPayment) {
        const amtStr = Number.isFinite(result.amount) ? `₹${result.amount.toFixed(2)}` : '₹(amount)';
        try {
          await notificationService.sendToRecipients({
            subject: `Verified QR Payment: ${amtStr} Received (Cashfree)`,
            message: `A Cashfree-verified QR payment of ${amtStr} was received and confirmed.\nPayment ID: ${result.paymentId}\nOrder ID: ${result.orderId}`,
            metadata: {
              Payment_ID: result.paymentId,
              Order_ID: result.orderId,
              Amount: amtStr,
              Method: 'Cashfree Verified QR (UPI)',
              Status: 'Paid & Verified',
              Timestamp: new Date().toISOString()
            }
          });
          console.log(`[PaymentController] Cashfree webhook auto-dispatched receipts for payment ${result.paymentId}`);
        } catch (notifErr) {
          console.warn(`[PaymentController] Cashfree webhook notification dispatch notice: ${notifErr.message}`);
        }
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error(`[PaymentController] Cashfree webhook error: ${err.message}`);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/payment/confirm-direct-upi
   * Confirms a direct UPI payment (e.g. user scanned QR and transferred ₹1),
   * updates status to 'paid', generates an official receipt, and auto-dispatches across the 3 channels.
   */
  async confirmDirectUpi(req, res, next) {
    try {
      const { order_id, ref_id, utr_number, amount, notifyRecipients = config.autoNotifyOnPayment } = req.body;
      const targetId = order_id || ref_id;

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: 'order_id or ref_id is required.'
        });
      }

      const existingOrder = await db.getPaymentByOrderId(targetId);
      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.'
        });
      }

      if (existingOrder.method && existingOrder.method !== 'upi_direct') {
        return res.status(400).json({
          success: false,
          message: 'This order cannot be confirmed via UPI direct.'
        });
      }

      if (existingOrder.status === 'paid') {
        return res.status(200).json({
          success: true,
          message: 'Direct UPI payment already confirmed.',
          alreadyPaid: true,
          paymentId: existingOrder.payment_id,
          transaction: existingOrder,
          notificationsDispatched: null
        });
      }

      if (existingOrder.status === 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Order already failed'
        });
      }

      const receiptId = `RCPT_UPI_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const paymentId = utr_number ? `UPI_UTR_${utr_number}` : `UPI_VERIFIED_${Date.now().toString().slice(-6)}`;

      const updated = await db.updatePayment(targetId, {
        status: 'paid',
        payment_id: paymentId,
        notes: {
          ...parseNotes(existingOrder.notes),
          utr: utr_number || 'direct_upi_confirmed',
          verifiedAt: new Date().toISOString()
        }
      });

      // Receipt amount comes from the DB record; fall back to client value only if DB has none
      const orderAmount = existingOrder.amount != null && existingOrder.amount !== ''
        ? existingOrder.amount
        : amount;

      let dispatchSummary = null;
      if (notifyRecipients) {
        try {
          const amtNum = orderAmount ? parseFloat(orderAmount) : null;
          const amtStr = amtNum ? `₹${amtNum.toFixed(2)}` : '₹(amount)';
          dispatchSummary = await notificationService.sendToRecipients({
            subject: `Official Receipt: ${amtStr} Payment Confirmed via UPI`,
            message: `Your payment of ${amtStr} has been verified!\nReceipt No: ${receiptId}\nTransaction Ref (UTR): ${paymentId}\nStatus: Completed & Credited`,
            metadata: {
              Receipt_Number: receiptId,
              Transaction_Ref: paymentId,
              Amount: amtStr,
              Method: 'Direct UPI Transfer',
              Payee: 'Ravi Sehrawat (ravi123sehravat@okaxis)',
              Status: 'Verified & Settled',
              Date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            }
          });
        } catch (notifErr) {
          console.warn(`[PaymentController] Post-UPI dispatch notice: ${notifErr.message}`);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Direct UPI payment confirmed and official receipt generated.',
        receiptId,
        paymentId,
        transaction: updated,
        notificationsDispatched: dispatchSummary
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payment/history
   * Retrieve recent payment transactions
   */
  async getHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const history = await paymentService.getPaymentHistory(limit);

      return res.status(200).json({
        success: true,
        count: history.length,
        data: history
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payment/webhook
   * Asynchronous Razorpay webhook handler
   */
  async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body);

      const result = await paymentService.handleWebhook({
        rawBody,
        signature,
        eventData: req.body
      });

      // Unverified webhook: do not process or dispatch anything
      if (result && result.verified === false) {
        return res.status(401).json(result);
      }

      // Automatically dispatch receipt on asynchronous webhook capture
      if (req.body?.event === 'payment.captured') {
        const payment = req.body?.payload?.payment?.entity;
        if (payment) {
          try {
            await notificationService.sendToRecipients({
              subject: `Payment Confirmation: ₹${(payment.amount / 100).toFixed(2)} Received (Auto-Captured)`,
              message: `Payment of ₹${(payment.amount / 100).toFixed(2)} was received and verified.\nPayment ID: ${payment.id}\nOrder ID: ${payment.order_id || 'N/A'}\nMethod: ${payment.method || 'UPI/Card'}`,
              metadata: {
                Payment_ID: payment.id,
                Order_ID: payment.order_id || 'N/A',
                Amount: `₹${(payment.amount / 100).toFixed(2)}`,
                Method: payment.method || 'UPI',
                Status: 'Captured & Verified',
                Timestamp: new Date().toISOString()
              }
            });
            console.log(`[PaymentController] Webhook auto-dispatched receipts for payment ${payment.id}`);
          } catch (notifErr) {
            console.warn(`[PaymentController] Webhook notification dispatch notice: ${notifErr.message}`);
          }
        }
      }

      // Auto-dispatch receipt when a Razorpay-managed QR is credited (verified payment)
      if (req.body?.event === 'qr_code.credited') {
        const payment = req.body?.payload?.payment?.entity;
        const qr = req.body?.payload?.qr_code?.entity;
        if (payment) {
          try {
            await notificationService.sendToRecipients({
              subject: `Verified QR Payment: ₹${(payment.amount / 100).toFixed(2)} Received`,
              message: `A Razorpay-verified QR payment of ₹${(payment.amount / 100).toFixed(2)} was received and confirmed.\nPayment ID: ${payment.id}\nQR Code ID: ${qr?.id || 'N/A'}`,
              metadata: {
                Payment_ID: payment.id,
                QR_Code_ID: qr?.id || 'N/A',
                Amount: `₹${(payment.amount / 100).toFixed(2)}`,
                Method: 'Razorpay Verified QR (UPI)',
                Status: 'Credited & Verified',
                Timestamp: new Date().toISOString()
              }
            });
            console.log(`[PaymentController] Webhook auto-dispatched receipts for QR payment ${payment.id}`);
          } catch (notifErr) {
            console.warn(`[PaymentController] QR webhook notification dispatch notice: ${notifErr.message}`);
          }
        }
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error(`[PaymentController] Webhook error: ${err.message}`);
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new PaymentController();
