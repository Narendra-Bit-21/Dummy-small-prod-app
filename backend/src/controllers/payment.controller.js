const paymentService = require('../services/payment.service');
const notificationService = require('../services/notification.service');

class PaymentController {
  /**
   * POST /api/payment/create-order
   * Create Razorpay order for ₹1 (or custom amount)
   */
  async createOrder(req, res, next) {
    try {
      let { amount = 1.00, currency = 'INR', receipt, notes } = req.body;

      let numAmount = Number(amount) || 1.00;
      // If amount is passed in paise (e.g. 100 for ₹1)
      if (numAmount >= 100 && Number.isInteger(numAmount)) {
        numAmount = numAmount / 100;
      }

      const orderData = await paymentService.createRazorpayOrder({
        amount: numAmount,
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
        notifyRecipients = true
      } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id) {
        return res.status(400).json({
          success: false,
          message: 'Both razorpay_order_id and razorpay_payment_id are required.'
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
        try {
          dispatchSummary = await notificationService.sendToRecipients({
            subject: 'Payment Confirmation: ₹1 Received',
            message: `A payment of ₹1.00 was successfully processed!\nOrder ID: ${razorpay_order_id}\nPayment ID: ${razorpay_payment_id}`,
            metadata: {
              Order_ID: razorpay_order_id,
              Payment_ID: razorpay_payment_id,
              Amount: '₹1.00',
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
        payeeVpa,
        payeeName,
        note,
        transactionNote = 'Dummy App Order ₹1',
        ref_id,
        orderId
      } = req.body;

      const upiResult = await paymentService.generateUpiQr({
        amount: Number(amount) || 1.00,
        payeeVpa,
        payeeName,
        transactionNote: note || transactionNote,
        orderId: ref_id || orderId
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
   * POST /api/payment/confirm-direct-upi
   * Confirms a direct UPI payment (e.g. user scanned QR and transferred ₹1),
   * updates status to 'paid', generates an official receipt, and auto-dispatches across the 3 channels.
   */
  async confirmDirectUpi(req, res, next) {
    try {
      const { order_id, ref_id, utr_number, notifyRecipients = true } = req.body;
      const targetId = order_id || ref_id;

      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: 'order_id or ref_id is required.'
        });
      }

      const receiptId = `RCPT_UPI_${Date.now().toString().slice(-6)}`;
      const paymentId = utr_number ? `UPI_UTR_${utr_number}` : `UPI_VERIFIED_${Date.now().toString().slice(-6)}`;

      const updated = await db.updatePayment(targetId, {
        status: 'paid',
        payment_id: paymentId,
        notes: { utr: utr_number || 'direct_upi_confirmed', verifiedAt: new Date().toISOString() }
      });

      let dispatchSummary = null;
      if (notifyRecipients) {
        try {
          dispatchSummary = await notificationService.sendToRecipients({
            subject: 'Official Receipt: ₹1.00 Payment Confirmed via UPI',
            message: `Your payment of ₹1.00 has been verified!\nReceipt No: ${receiptId}\nTransaction Ref (UTR): ${paymentId}\nStatus: Completed & Credited`,
            metadata: {
              Receipt_Number: receiptId,
              Transaction_Ref: paymentId,
              Amount: '₹1.00',
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

      // Automatically dispatch receipt on asynchronous webhook capture
      if (req.body?.event === 'payment.captured') {
        const payment = req.body?.payload?.payment?.entity;
        if (payment) {
          try {
            await notificationService.sendToRecipients({
              subject: 'Payment Confirmation: ₹1.00 Received (Auto-Captured)',
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

      return res.status(200).json(result);
    } catch (err) {
      console.error(`[PaymentController] Webhook error: ${err.message}`);
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new PaymentController();
