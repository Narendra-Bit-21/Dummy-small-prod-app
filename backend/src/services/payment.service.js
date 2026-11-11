const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/env');
const db = require('../db/database');

let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  Razorpay = null;
}

let qrcode = null;
try {
  qrcode = require('qrcode');
} catch (e) {
  qrcode = null;
}

class PaymentService {
  constructor() {
    this.razorpayClient = null;
    this._initRazorpay();
  }

  /**
   * Timing-safe comparison of two hex signature strings
   */
  static _safeCompare(expected, received) {
    const a = Buffer.from(String(expected ?? ''));
    const b = Buffer.from(String(received ?? ''));
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  _initRazorpay() {
    if (Razorpay && config.razorpay.isConfigured) {
      try {
        this.razorpayClient = new Razorpay({
          key_id: config.razorpay.keyId,
          key_secret: config.razorpay.keySecret
        });
        console.log('[PaymentService] Razorpay client initialized successfully.');
      } catch (err) {
        console.warn(`[PaymentService] Could not initialize Razorpay client: ${err.message}`);
        this.razorpayClient = null;
      }
    } else {
      console.log('[PaymentService] Razorpay running in sandbox / demo mode (set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to enable live API).');
    }
  }

  /**
   * Create Razorpay Order
   * Default amount: ₹1.00 = 100 paise
   */
  async createRazorpayOrder({ amount = 1.00, currency = 'INR', receipt = null, notes = {} }) {
    const amountInPaise = Math.round(Number(amount) * 100);
    const receiptId = receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    if (this.razorpayClient) {
      try {
        const order = await this.razorpayClient.orders.create({
          amount: amountInPaise,
          currency,
          receipt: receiptId,
          notes: {
            app: 'Dummy-small-prod-app',
            ...notes
          }
        });

        // Save order in database
        await db.createPayment({
          order_id: order.id,
          amount: Number(amount),
          currency: order.currency,
          status: 'created',
          method: 'razorpay',
          notes: order.notes
        });

        return {
          success: true,
          mode: 'live_razorpay',
          orderId: order.id,
          amount: order.amount,
          amountFormatted: `₹${(order.amount / 100).toFixed(2)}`,
          currency: order.currency,
          keyId: config.razorpay.keyId,
          receipt: order.receipt
        };
      } catch (err) {
        console.error(`[PaymentService] Razorpay API Error: ${err.message}`);
        // Never silently fall back to a simulated order in production
        if (config.nodeEnv === 'production' && config.razorpay.isConfigured) {
          throw err;
        }
        // If API fails due to invalid test credentials, return friendly guidance
        return this._createSimulatedOrder({ amount, currency, receiptId, notes, errorHint: err.message });
      }
    }

    // Razorpay not configured: Return high-fidelity mock order
    return this._createSimulatedOrder({ amount, currency, receiptId, notes });
  }

  async _createSimulatedOrder({ amount, currency, receiptId, notes, errorHint = null }) {
    const mockOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const amountInPaise = Math.round(Number(amount) * 100);

    await db.createPayment({
      order_id: mockOrderId,
      amount: Number(amount),
      currency,
      status: 'created',
      method: 'razorpay',
      notes: { simulated: true, errorHint, ...notes }
    });

    return {
      success: true,
      mode: 'simulated_razorpay',
      orderId: mockOrderId,
      amount: amountInPaise,
      amountFormatted: `₹${Number(amount).toFixed(2)}`,
      currency,
      keyId: config.razorpay.keyId || 'rzp_test_placeholder',
      receipt: receiptId,
      notice: errorHint
        ? `Razorpay rejected credentials (${errorHint}). Generated sandbox test order for frontend testing.`
        : 'Razorpay keys not configured in .env. Generated sandbox test order.'
    };
  }

  /**
   * Verify Razorpay Payment Signature
   */
  async verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    if (!razorpay_order_id || !razorpay_payment_id) {
      throw new Error('razorpay_order_id and razorpay_payment_id are required for verification.');
    }

    const isProduction = config.nodeEnv === 'production';
    const existingPayment = await db.getPaymentByOrderId(razorpay_order_id);
    let isValid = false;

    // If simulated order: only honoured outside production, for a known, not-yet-paid order
    if (razorpay_order_id.startsWith('order_sim_')) {
      isValid = !isProduction && !!existingPayment && existingPayment.status !== 'paid';
    } else if (config.razorpay.keySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', config.razorpay.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      isValid = PaymentService._safeCompare(generatedSignature, razorpay_signature);
    } else if (isProduction) {
      // Refuse to verify anything in production without a secret
      return {
        verified: false,
        message: 'Payment verification unavailable — server misconfigured.'
      };
    } else {
      // In development fallback if no secret configured
      isValid = true;
    }

    if (!isValid) {
      // Do not touch the DB: a forged/junk signature must not be able to alter order state
      return {
        verified: false,
        message: 'Invalid payment signature. Verification failed.'
      };
    }

    const updated = await db.updatePayment(razorpay_order_id, {
      status: 'paid',
      payment_id: razorpay_payment_id,
      signature: razorpay_signature
    });

    return {
      verified: true,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      payment: updated,
      message: 'Payment signature verified successfully.'
    };
  }

  /**
   * Generate Direct NPCI UPI Dynamic QR Code
   * URI format: upi://pay?pa=...&pn=...&am=1.00&cu=INR&tn=...
   */
  async generateUpiQr({
    amount = 1.00,
    payeeVpa = null,
    payeeName = null,
    transactionNote = 'Order ₹1 Payment',
    orderId = null
  }) {
    const vpa = payeeVpa || config.upi.vpa;
    const name = payeeName || config.upi.payeeName;
    const refId = orderId || `UPI_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const formattedAmount = Number(amount).toFixed(2);

    // Build standard NPCI UPI Deep Link URI
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent(transactionNote)}&tr=${encodeURIComponent(refId)}`;

    // Generate Base64 QR Code
    let qrDataUrl = '';
    if (qrcode) {
      try {
        qrDataUrl = await qrcode.toDataURL(upiUri, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          margin: 2,
          scale: 8,
          color: {
            dark: '#111827',
            light: '#ffffff'
          }
        });
      } catch (err) {
        console.error(`[PaymentService] QR Code generation failed: ${err.message}`);
      }
    }

    // Fallback public SVG QR code generator if qrcode lib had an issue
    if (!qrDataUrl) {
      qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUri)}`;
    }

    // Save transaction in database
    await db.createPayment({
      order_id: refId,
      amount: Number(amount),
      currency: 'INR',
      status: 'pending',
      method: 'upi_direct',
      upi_uri: upiUri,
      notes: { payeeVpa: vpa, payeeName: name, transactionNote }
    });

    return {
      success: true,
      orderId: refId,
      amount: Number(amount),
      amountFormatted: `₹${formattedAmount}`,
      payeeVpa: vpa,
      payeeName: name,
      transactionNote,
      upiUri,
      qrCodeDataUrl: qrDataUrl,
      deepLink: upiUri,
      instructions: [
        'Scan this QR code using Google Pay, PhonePe, Paytm, BHIM, or any UPI app.',
        'Payment goes directly to payee VPA with zero merchant transaction fees.',
        'On mobile, tapping the intent link opens your preferred UPI app directly.'
      ]
    };
  }

  /**
   * Create a Razorpay-managed dynamic UPI QR code (QR Codes API).
   * Unlike the trust-based Direct UPI QR, payment here is VERIFIED:
   * Razorpay fires a `qr_code.credited` webhook (and fetchAllPayments polling is the fallback).
   * `amount` is in RUPEES; Razorpay's `payment_amount` wants PAISE.
   */
  async createRazorpayQr({ amount = 1.00, description = 'QuickPay Dynamic QR Payment' }) {
    // Never fake-simulate a QR: a Razorpay-managed QR cannot be verified without the live client
    if (!this.razorpayClient) {
      return {
        success: false,
        error: 'razorpay_not_configured',
        message: 'Razorpay is not configured on the server. Set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to enable verified QR codes.'
      };
    }

    const amountInPaise = Math.round(Number(amount) * 100);

    try {
      const qr = await this.razorpayClient.qrCode.create({
        type: 'upi_qr',
        name: 'QuickPay Dynamic QR',
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amountInPaise,
        description,
        notes: {
          app: 'Dummy-small-prod-app',
          purpose: 'razorpay_verified_qr'
        }
      });

      // Persist a pending payment row keyed by the QR code id (order_id === qr.id)
      await db.createPayment({
        order_id: qr.id,
        amount: Number(amount),
        currency: 'INR',
        status: 'created',
        method: 'razorpay_qr',
        notes: { qrId: qr.id, description }
      });

      return {
        success: true,
        qrId: qr.id,
        qrImageUrl: qr.image_url,
        amount: Number(amount),
        amountFormatted: `₹${Number(amount).toFixed(2)}`,
        status: qr.status,
        description
      };
    } catch (err) {
      // Razorpay SDK errors nest the real reason under err.error.description
      const rzpMessage = err?.error?.description || err?.message || 'Razorpay could not create the QR code.';
      console.error(`[PaymentService] Razorpay QR creation error: ${rzpMessage}`);
      return {
        success: false,
        error: 'razorpay_qr_failed',
        message: rzpMessage
      };
    }
  }

  /**
   * Check whether a Razorpay QR code has been paid.
   * The local DB is authoritative once the `qr_code.credited` webhook has marked it paid;
   * otherwise we poll Razorpay's fetchAllPayments as a safety net (for setups without webhooks).
   */
  async getRazorpayQrStatus(qrId) {
    if (!qrId) {
      throw new Error('qrId is required.');
    }

    const existing = await db.getPaymentByOrderId(qrId);

    // Webhook already confirmed this payment — trust the DB
    if (existing && existing.status === 'paid') {
      return { status: 'paid', paid: true, paymentId: existing.payment_id || null };
    }

    // Fallback: ask Razorpay directly in case the webhook isn't configured / hasn't arrived
    if (this.razorpayClient) {
      try {
        const result = await this.razorpayClient.qrCode.fetchAllPayments(qrId);
        const payments = (result && result.items) || [];
        const captured = payments.find((p) => p.status === 'captured');
        if (captured) {
          // Out-of-order safety: only promote a not-yet-paid row to paid, never downgrade
          if (existing && existing.status !== 'paid') {
            await db.updatePayment(qrId, { status: 'paid', payment_id: captured.id });
          }
          return { status: 'paid', paid: true, paymentId: captured.id };
        }
      } catch (err) {
        console.warn(`[PaymentService] Razorpay QR status poll notice: ${err.message}`);
      }
    }

    return { status: existing ? existing.status : 'unknown', paid: false };
  }

  /**
   * Shared Cashfree PG request helper (sandbox vs production base URL + auth headers).
   */
  _cashfreeRequest(method, path, data) {
    const baseUrl = config.cashfree.env === 'PROD'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

    return axios({
      method,
      url: `${baseUrl}${path}`,
      data,
      timeout: 15000,
      headers: {
        'x-client-id': config.cashfree.appId,
        'x-client-secret': config.cashfree.secretKey,
        'x-api-version': config.cashfree.apiVersion,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a Cashfree-managed dynamic UPI QR (verified payment).
   * Step 1: create a Cashfree order → payment_session_id.
   * Step 2: start a UPI "qrcode" payment on that session → base64 PNG QR data URI.
   * Payment is confirmed by polling GET /orders/{id}/payments (webhook is a fast-path bonus).
   * `amount` is in RUPEES (Cashfree's order_amount is rupees, not paise).
   */
  async createCashfreeQr({ amount = 1.00, description = 'QuickPay Cashfree QR Payment' }) {
    // Never fake-simulate a QR: a Cashfree QR cannot be verified without real credentials
    if (!config.cashfree.isConfigured) {
      return {
        success: false,
        error: 'cashfree_not_configured',
        message: 'Cashfree is not configured on the server. Set CASHFREE_APP_ID & CASHFREE_SECRET_KEY to enable Cashfree verified QR codes.'
      };
    }

    const orderAmount = Number(Number(amount).toFixed(2));
    const orderId = `cf_qr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    try {
      const orderRes = await this._cashfreeRequest('post', '/orders', {
        order_id: orderId,
        order_amount: orderAmount,
        order_currency: 'INR',
        order_note: String(description).slice(0, 200),
        customer_details: {
          customer_id: `cust_${Date.now()}`,
          customer_phone: '8707076667',
          customer_email: 'ravi123sehravat@gmail.com'
        }
      });

      const paymentSessionId = orderRes.data && orderRes.data.payment_session_id;
      if (!paymentSessionId) {
        return {
          success: false,
          error: 'cashfree_qr_failed',
          message: 'Cashfree did not return a payment session for the order.'
        };
      }

      const payRes = await this._cashfreeRequest('post', '/orders/sessions', {
        payment_session_id: paymentSessionId,
        payment_method: { upi: { channel: 'qrcode' } }
      });

      const qrImageUrl = payRes.data?.data?.payload?.qrcode;
      if (!qrImageUrl || !String(qrImageUrl).startsWith('data:image/')) {
        return {
          success: false,
          error: 'cashfree_qr_failed',
          message: 'Cashfree did not return a UPI QR image for the order.'
        };
      }

      // Persist a pending payment row keyed by our Cashfree order_id
      await db.createPayment({
        order_id: orderId,
        amount: orderAmount,
        currency: 'INR',
        status: 'created',
        method: 'cashfree_qr',
        notes: { cfOrderId: orderRes.data.cf_order_id || null, description }
      });

      return {
        success: true,
        orderId,
        cfOrderId: orderRes.data.cf_order_id || null,
        qrImageUrl,
        amount: orderAmount,
        amountFormatted: `₹${orderAmount.toFixed(2)}`,
        status: orderRes.data.order_status || 'ACTIVE',
        description
      };
    } catch (err) {
      // Cashfree API errors carry the real reason under response.data.message
      const cfMessage = err?.response?.data?.message || err?.message || 'Cashfree could not create the QR code.';
      console.error(`[PaymentService] Cashfree QR creation error: ${cfMessage}`);
      return {
        success: false,
        error: 'cashfree_qr_failed',
        message: cfMessage
      };
    }
  }

  /**
   * Check whether a Cashfree QR order has been paid.
   * The local DB is authoritative once marked paid (by a previous poll or the webhook);
   * otherwise we poll Cashfree's GET /orders/{order_id}/payments (the primary confirmation path).
   */
  async getCashfreeQrStatus(orderId) {
    if (!orderId) {
      throw new Error('orderId is required.');
    }

    const existing = await db.getPaymentByOrderId(orderId);

    // Only track orders this server created through the Cashfree QR flow
    if (!existing || existing.method !== 'cashfree_qr') {
      return { status: 'unknown', paid: false };
    }

    if (existing.status === 'paid') {
      return { status: 'paid', paid: true, paymentId: existing.payment_id || null };
    }

    if (config.cashfree.isConfigured) {
      try {
        const res = await this._cashfreeRequest('get', `/orders/${encodeURIComponent(orderId)}/payments`);
        const payments = Array.isArray(res.data) ? res.data : [];
        const success = payments.find((p) => p.payment_status === 'SUCCESS');
        if (success) {
          const paymentId = String(success.cf_payment_id);
          // Out-of-order safety: only promote a not-yet-paid row to paid, never downgrade
          await db.updatePayment(orderId, { status: 'paid', payment_id: paymentId });
          // newlyPaid distinguishes this first-detection tick from later polls of an already-paid order
          return { status: 'paid', paid: true, paymentId, newlyPaid: true, amount: existing.amount };
        }
      } catch (err) {
        const cfMessage = err?.response?.data?.message || err.message;
        console.warn(`[PaymentService] Cashfree QR status poll notice: ${cfMessage}`);
      }
    }

    return { status: existing.status, paid: false };
  }

  /**
   * Handle Cashfree Webhook Events (best-effort fast path; polling is authoritative).
   * Signature = Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, CASHFREE_SECRET_KEY)).
   */
  async handleCashfreeWebhook({ rawBody, signature, timestamp, eventData }) {
    if (!config.cashfree.isConfigured || !signature || !timestamp || !rawBody) {
      console.warn('[PaymentService] Cashfree webhook rejected: missing secret, signature, timestamp, or body.');
      return { success: false, verified: false };
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.cashfree.secretKey)
      .update(String(timestamp) + rawBody)
      .digest('base64');

    if (!PaymentService._safeCompare(expectedSignature, signature)) {
      throw new Error('Invalid Cashfree webhook signature');
    }

    const event = eventData?.type;
    console.log(`[PaymentService] Cashfree webhook received event: ${event}`);

    // Cashfree docs disagree on the success event name — accept either
    if (event === 'PAYMENT_SUCCESS_WEBHOOK' || event === 'PAYMENT_SUCCESS') {
      const orderId = eventData?.data?.order?.order_id;
      const payment = eventData?.data?.payment;
      if (orderId && payment && payment.payment_status === 'SUCCESS') {
        const current = await db.getPaymentByOrderId(orderId);
        if (!current || current.method !== 'cashfree_qr') {
          return { received: true, event, ignored: true };
        }
        // Out-of-order / duplicate events: never re-process an already-paid order
        if (current.status === 'paid') {
          console.log(`[PaymentService] Ignoring ${event} for already-paid Cashfree order ${orderId}`);
          return { received: true, event };
        }
        await db.updatePayment(orderId, {
          status: 'paid',
          payment_id: String(payment.cf_payment_id)
        });
        return {
          received: true,
          event,
          newlyPaid: true,
          orderId,
          paymentId: String(payment.cf_payment_id),
          amount: Number(payment.payment_amount)
        };
      }
    }

    return { received: true, event };
  }

  /**
   * Handle Razorpay Webhook Events
   */
  async handleWebhook({ rawBody, signature, eventData }) {
    // Both a configured secret and a signature header are mandatory
    if (!config.razorpay.webhookSecret || !signature) {
      console.warn('[PaymentService] Webhook rejected: missing webhook secret or signature header.');
      return { success: false, verified: false };
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!PaymentService._safeCompare(expectedSignature, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const event = eventData.event;
    console.log(`[PaymentService] Webhook received event: ${event}`);

    if (event === 'payment.captured') {
      const payment = eventData.payload?.payment?.entity;
      if (payment && payment.order_id) {
        await db.updatePayment(payment.order_id, {
          status: 'paid',
          payment_id: payment.id
        });
      }
    } else if (event === 'payment.failed') {
      const payment = eventData.payload?.payment?.entity;
      if (payment && payment.order_id) {
        // Out-of-order events: never downgrade an already-paid order
        const current = await db.getPaymentByOrderId(payment.order_id);
        if (current && current.status === 'paid') {
          console.log(`[PaymentService] Ignoring payment.failed for already-paid order ${payment.order_id}`);
          return { received: true, event };
        }
        await db.updatePayment(payment.order_id, {
          status: 'failed',
          payment_id: payment.id
        });
      }
    } else if (event === 'qr_code.credited') {
      // Razorpay QR Codes API: a customer paid against a managed dynamic QR.
      // Payload carries both the payment entity and the QR entity; our DB row is keyed by qr.id.
      const payment = eventData.payload?.payment?.entity;
      const qr = eventData.payload?.qr_code?.entity;
      const qrId = qr?.id;
      if (qrId && payment) {
        // Out-of-order events: never downgrade an already-paid QR
        const current = await db.getPaymentByOrderId(qrId);
        if (current && current.status === 'paid') {
          console.log(`[PaymentService] Ignoring qr_code.credited for already-paid QR ${qrId}`);
          return { received: true, event };
        }
        await db.updatePayment(qrId, {
          status: 'paid',
          payment_id: payment.id
        });
      }
    }

    return { received: true, event };
  }

  /**
   * Retrieve payment transaction history
   */

  /**
   * Create Cashfree Payment Order (Alternative Gateway to Razorpay)
   */
  async createCashfreeOrder({ amount = 1.00, customerPhone = '8707076667', customerEmail = 'ravi123sehravat@gmail.com' }) {
    const orderId = cf_ord__;
    const formattedAmount = Number(amount).toFixed(2);

    if (config.cashfree.isConfigured) {
      try {
        const baseUrl = config.cashfree.env === 'PROD'
          ? 'https://api.cashfree.com/pg/orders'
          : 'https://sandbox.cashfree.com/pg/orders';

        const cleanPhone = customerPhone.replace(/[^0-9]/g, '').slice(-10) || '8707076667';
        const res = await axios.post(
          baseUrl,
          {
            order_id: orderId,
            order_amount: Number(formattedAmount),
            order_currency: 'INR',
            customer_details: {
              customer_id: cust_,
              customer_phone: cleanPhone,
              customer_email: customerEmail || 'ravi123sehravat@gmail.com',
              customer_name: 'Customer'
            },
            order_meta: {
              notify_url: 'https://example.com/api/payment/cashfree-webhook'
            }
          },
          {
            headers: {
              'x-client-id': config.cashfree.appId,
              'x-client-secret': config.cashfree.secretKey,
              'x-api-version': config.cashfree.apiVersion,
              'Content-Type': 'application/json'
            }
          }
        );

        await db.createPayment({
          order_id: orderId,
          amount: Number(formattedAmount),
          currency: 'INR',
          status: 'created',
          method: 'cashfree',
          notes: { payment_session_id: res.data.payment_session_id }
        });

        return {
          success: true,
          mode: 'live_cashfree',
          orderId: orderId,
          paymentSessionId: res.data.payment_session_id,
          amount: Number(formattedAmount),
          currency: 'INR',
          environment: config.cashfree.env
        };
      } catch (err) {
        console.warn(`[PaymentService] Cashfree API notice: ${err.message}. Using simulated order.`);
      }
    }

    // Simulated Cashfree order if API keys are pending
    await db.createPayment({
      order_id: orderId,
      amount: Number(formattedAmount),
      currency: 'INR',
      status: 'created',
      method: 'cashfree',
      notes: { simulated: true }
    });

    return {
      success: true,
      mode: 'simulated_cashfree',
      orderId: orderId,
      paymentSessionId: session_sim_,
      amount: Number(formattedAmount),
      currency: 'INR',
      environment: 'TEST'
    };
  }
  async getPaymentHistory(limit = 50) {
    return await db.getPayments(limit);
  }
}

module.exports = new PaymentService();
