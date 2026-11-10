const crypto = require('crypto');
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

    let isValid = false;

    // If simulated order
    if (razorpay_order_id.startsWith('order_sim_')) {
      isValid = true;
    } else if (config.razorpay.keySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', config.razorpay.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      isValid = generatedSignature === razorpay_signature;
    } else {
      // In development fallback if no secret configured
      isValid = true;
    }

    if (!isValid) {
      await db.updatePayment(razorpay_order_id, {
        status: 'failed',
        payment_id: razorpay_payment_id,
        signature: razorpay_signature
      });
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
   * Handle Razorpay Webhook Events
   */
  async handleWebhook({ rawBody, signature, eventData }) {
    if (config.razorpay.webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', config.razorpay.webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        throw new Error('Invalid webhook signature');
      }
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
        await db.updatePayment(payment.order_id, {
          status: 'failed',
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
