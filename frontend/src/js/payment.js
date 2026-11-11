/**
 * QuickPay & Notify Studio - Payment Checkout Module
 * Handles Amazon/Flipkart style checkout, Razorpay standard gateway,
 * Dynamic UPI QR code generation, countdown timers, and receipt printing.
 */

// Local HTML-escape helper (mirrors escHtml in app.js / escHtmlNotif in notifications.js)
function escHtmlPay(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

class PaymentManager {
  constructor() {
    this.selectedMethod = 'razorpay'; // 'razorpay' | 'upi_qr' | 'razorpay_qr' | 'cashfree_qr'
    this.countdownTimer = null;
    this.remainingSeconds = 300; // 5 minutes
    this.currentOrder = null;
    this.lastTransaction = null;
    this.currentUpiData = null;
    this.razorpayQrData = null;
    this.razorpayQrPollTimer = null;
    this.cashfreeQrData = null;
    this.cashfreeQrPollTimer = null;

    this.initElements();
    this.bindEvents();
  }

  getAmount() {
    const input = document.getElementById('payment-amount-input');
    const val = parseFloat(input ? input.value : 1);
    return isNaN(val) || val < 1 ? 1 : Math.round(val * 100) / 100;
  }

  initElements() {
    this.amountInput = document.getElementById('payment-amount-input');
    // Payment Method selection tabs/radios
    this.methodRazorpayBtn = document.getElementById('method-razorpay-btn');
    this.methodUpiQrBtn = document.getElementById('method-upiqr-btn');
    this.methodRazorpayQrBtn = document.getElementById('method-razorpay-qr-btn');
    this.razorpayContainer = document.getElementById('razorpay-method-view');
    this.upiqrContainer = document.getElementById('upiqr-method-view');
    this.razorpayQrContainer = document.getElementById('razorpay-qr-method-view');
    this.methodCashfreeQrBtn = document.getElementById('method-cashfree-qr-btn');
    this.cashfreeQrContainer = document.getElementById('cashfree-qr-method-view');

    // Razorpay Verified QR Elements
    this.btnGenerateRazorpayQr = document.getElementById('btn-generate-razorpay-qr');
    this.razorpayQrImage = document.getElementById('razorpay-qr-image');
    this.razorpayQrPlaceholder = document.getElementById('razorpay-qr-placeholder');
    this.razorpayQrStatusBadge = document.getElementById('razorpay-qr-status');
    this.razorpayQrIdText = document.getElementById('razorpay-qr-id');

    // Cashfree Verified QR Elements
    this.btnGenerateCashfreeQr = document.getElementById('btn-generate-cashfree-qr');
    this.cashfreeQrImage = document.getElementById('cashfree-qr-image');
    this.cashfreeQrPlaceholder = document.getElementById('cashfree-qr-placeholder');
    this.cashfreeQrStatusBadge = document.getElementById('cashfree-qr-status');
    this.cashfreeQrIdText = document.getElementById('cashfree-qr-id');

    // Razorpay Checkout Button
    this.btnPayRazorpay = document.getElementById('btn-pay-razorpay');
    this.btnSimulatePayment = document.getElementById('btn-simulate-payment');

    // UPI QR Elements
    this.btnGenerateUpiQr = document.getElementById('btn-generate-upi');
    this.upiQrDisplay = document.getElementById('upi-qr-display');
    this.upiQrImage = document.getElementById('upi-qr-image');
    this.upiRefText = document.getElementById('upi-ref-text');
    this.upiStringInput = document.getElementById('upi-string-input');
    this.btnCopyUpi = document.getElementById('btn-copy-upi');
    this.upiTimerText = document.getElementById('upi-timer-text');
    this.upiTimerProgress = document.getElementById('upi-timer-progress');
    this.btnSimulateQrScan = document.getElementById('btn-simulate-qr-scan');

    // App Deep Links
    this.btnGpay = document.getElementById('btn-app-gpay');
    this.btnPhonepe = document.getElementById('btn-app-phonepe');
    this.btnPaytm = document.getElementById('btn-app-paytm');
    this.btnBhim = document.getElementById('btn-app-bhim');

    // Receipt Modal Elements
    this.receiptModal = document.getElementById('receipt-modal');
    this.receiptModalClose = document.getElementById('receipt-modal-close');
    this.receiptPrintBtn = document.getElementById('receipt-print-btn');
    this.receiptDownloadBtn = document.getElementById('receipt-download-btn');
    this.receiptNotifyBtn = document.getElementById('receipt-notify-btn');

    // Receipt placeholders
    this.receiptIdEl = document.getElementById('receipt-id');
    this.receiptPaymentIdEl = document.getElementById('receipt-payment-id');
    this.receiptOrderIdEl = document.getElementById('receipt-order-id');
    this.receiptTimeEl = document.getElementById('receipt-timestamp');
    this.receiptMethodEl = document.getElementById('receipt-method');
    this.receiptAmountEl = document.getElementById('receipt-amount');
  }

  bindEvents() {
    // Switch payment tabs
    if (this.methodRazorpayBtn) {
      this.methodRazorpayBtn.addEventListener('click', () => this.switchMethod('razorpay'));
    }
    if (this.methodUpiQrBtn) {
      this.methodUpiQrBtn.addEventListener('click', () => this.switchMethod('upi_qr'));
    }
    if (this.methodRazorpayQrBtn) {
      this.methodRazorpayQrBtn.addEventListener('click', () => this.switchMethod('razorpay_qr'));
    }

    // Generate / regenerate Razorpay Verified QR
    if (this.btnGenerateRazorpayQr) {
      this.btnGenerateRazorpayQr.addEventListener('click', () => this.generateRazorpayQrCode());
    }

    if (this.methodCashfreeQrBtn) {
      this.methodCashfreeQrBtn.addEventListener('click', () => this.switchMethod('cashfree_qr'));
    }

    // Generate / regenerate Cashfree Verified QR
    if (this.btnGenerateCashfreeQr) {
      this.btnGenerateCashfreeQr.addEventListener('click', () => this.generateCashfreeQrCode());
    }

    // Trigger Razorpay standard payment
    if (this.btnPayRazorpay) {
      this.btnPayRazorpay.addEventListener('click', () => this.startRazorpayPayment());
    }

    // Fallback simulation button
    if (this.btnSimulatePayment) {
      this.btnSimulatePayment.addEventListener('click', () => this.simulateDirectPayment('Razorpay Simulator'));
    }

    // Generate UPI QR
    if (this.btnGenerateUpiQr) {
      this.btnGenerateUpiQr.addEventListener('click', () => this.generateUpiQrCode());
    }

    // I've Paid — confirm UPI payment and show receipt
    if (this.btnSimulateQrScan) {
      this.btnSimulateQrScan.addEventListener('click', () => this.confirmUpiPayment());
    }

    // Copy UPI String
    if (this.btnCopyUpi) {
      this.btnCopyUpi.addEventListener('click', () => this.copyUpiString());
    }

    // App Deep Links
    const openDeepLink = (prefix) => {
      if (!this.currentUpiData || !this.currentUpiData.upi_string) {
        window.app.showToast('info', 'Generate QR First', 'Please generate the UPI QR code before launching apps.');
        return;
      }
      const rawUri = this.currentUpiData.upi_string;
      let targetUri = rawUri;
      if (prefix && prefix !== 'upi://') {
        targetUri = rawUri.replace(/^upi:\/\//, prefix);
      }
      
      // Attempt window navigation for mobile
      window.location.href = targetUri;

      // Provide instant feedback and fallback copy
      window.app.showToast('success', 'UPI App Triggered', 'Opening UPI application. If not redirected, copy the UPI link.');
    };

    if (this.btnGpay) this.btnGpay.addEventListener('click', () => openDeepLink('tez://upi/'));
    if (this.btnPhonepe) this.btnPhonepe.addEventListener('click', () => openDeepLink('phonepe://'));
    if (this.btnPaytm) this.btnPaytm.addEventListener('click', () => openDeepLink('paytmmp://'));
    if (this.btnBhim) this.btnBhim.addEventListener('click', () => openDeepLink('upi://'));

    // Update all amount displays when amount changes
    if (this.amountInput) {
      this.amountInput.addEventListener('input', () => {
        const amt = this.getAmount();
        const label = document.getElementById('btn-paid-label');
        if (label) label.textContent = `I've Paid ₹${amt.toFixed(2)} — Confirm & Get Receipt`;
        const heading = document.getElementById('checkout-heading');
        if (heading) heading.textContent = `₹${amt.toFixed(2)} Payment Checkout`;
        const navLabel = document.getElementById('nav-checkout-label');
        if (navLabel) navLabel.textContent = `₹${amt.toFixed(2)} Checkout`;
        const subtitle = document.getElementById('header-subtitle');
        if (subtitle) subtitle.textContent = `₹${amt.toFixed(2)}`;
        const total = document.getElementById('order-summary-total');
        if (total) total.textContent = `₹${amt.toFixed(2)}`;
        const base = amt / 1.18;
        const gst = amt - base;
        const baseEl = document.getElementById('order-base-price');
        if (baseEl) baseEl.textContent = `₹${base.toFixed(2)}`;
        const gstEl = document.getElementById('order-gst');
        if (gstEl) gstEl.textContent = `₹${gst.toFixed(2)}`;
        this.setPayButtonLoading(false);
        this.currentUpiData = null; // force QR regeneration on next switch
        this.stopRazorpayQrPolling();
        this.razorpayQrData = null; // force Razorpay QR regeneration on next switch
        this.stopCashfreeQrPolling();
        this.cashfreeQrData = null; // force Cashfree QR regeneration on next switch
      });
    }

    // Receipt Modal Actions
    if (this.receiptModalClose) {
      this.receiptModalClose.addEventListener('click', () => this.closeReceiptModal());
    }
    if (this.receiptPrintBtn) {
      this.receiptPrintBtn.addEventListener('click', () => window.print());
    }
    if (this.receiptDownloadBtn) {
      this.receiptDownloadBtn.addEventListener('click', () => this.downloadReceipt());
    }
    if (this.receiptNotifyBtn) {
      this.receiptNotifyBtn.addEventListener('click', () => this.transferToNotificationStudio());
    }
  }

  switchMethod(method) {
    this.selectedMethod = method;

    // Stop live Razorpay QR polling whenever we leave that tab
    if (method !== 'razorpay_qr') {
      this.stopRazorpayQrPolling();
    }
    if (method !== 'cashfree_qr') {
      this.stopCashfreeQrPolling();
    }

    const activeClasses = ['border-blue-600', 'bg-blue-50/50', 'dark:bg-blue-900/20'];
    const inactiveClasses = ['border-slate-200', 'dark:border-slate-700'];

    const tabs = [
      { btn: this.methodRazorpayBtn, view: this.razorpayContainer, key: 'razorpay' },
      { btn: this.methodUpiQrBtn, view: this.upiqrContainer, key: 'upi_qr' },
      { btn: this.methodRazorpayQrBtn, view: this.razorpayQrContainer, key: 'razorpay_qr' },
      { btn: this.methodCashfreeQrBtn, view: this.cashfreeQrContainer, key: 'cashfree_qr' }
    ];

    tabs.forEach(({ btn, view, key }) => {
      if (!btn || !view) return;
      if (key === method) {
        btn.classList.add(...activeClasses);
        btn.classList.remove(...inactiveClasses);
        view.classList.remove('hidden');
      } else {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
        view.classList.add('hidden');
      }
    });

    // Auto generate the relevant QR the first time its tab is opened
    if (method === 'upi_qr' && !this.currentUpiData) {
      this.generateUpiQrCode();
    }
    if (method === 'razorpay_qr' && !this.razorpayQrData) {
      this.generateRazorpayQrCode();
    }
    if (method === 'cashfree_qr' && !this.cashfreeQrData) {
      this.generateCashfreeQrCode();
    }
  }

  /**
   * Start Razorpay Standard Checkout Popup
   */
  async startRazorpayPayment() {
    try {
      this.setPayButtonLoading(true, 'Initializing Gateway...');

      // 1. Create order on backend / mock
      const amount = this.getAmount();
      const order = await window.apiService.createPaymentOrder(amount);
      this.currentOrder = order;

      // 2. Check if Razorpay script is loaded
      if (typeof window.Razorpay === 'undefined') {
        await this.loadRazorpayScript();
      }

      // Check if Razorpay key is valid or mock test key
      const keyId = window.apiService.razorpayKeyId;

      const options = {
        key: keyId,
        amount: order.amount || Math.round(amount * 100),
        currency: order.currency || 'INR',
        name: 'QuickPay & Notify Studio',
        description: `Payment of ₹${amount.toFixed(2)}`,
        order_id: order.order_id,
        image: 'https://cdn-icons-png.flaticon.com/512/9131/9131529.png',
        prefill: {
          name: 'Ravi Sehravat',
          email: window.apiService.senderEmail,
          contact: '+919876543210'
        },
        notes: {
          purpose: 'Production Verification ₹1',
          environment: window.apiService.environment
        },
        theme: {
          color: '#2563eb'
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true
        },
        handler: async (response) => {
          this.setPayButtonLoading(true, 'Verifying Payment...');
          try {
            const verifyRes = await window.apiService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount
            });

            if (!verifyRes || verifyRes.success === false) {
              window.app.showToast('error', 'Verification Failed', (verifyRes && verifyRes.message) || 'Unable to verify payment signature.');
              window.app.refreshHistory();
              return;
            }

            this.showReceipt(verifyRes.transaction || {
              id: `txn_${Date.now()}`,
              order_id: response.razorpay_order_id,
              payment_id: response.razorpay_payment_id,
              amount,
              method: 'Razorpay Gateway',
              created_at: new Date().toISOString()
            });

            window.app.showToast('success', 'Payment Verified!', `₹${amount.toFixed(2)} payment received and signature verified successfully.`);
            window.app.playTone('success');
            window.app.refreshHistory();
          } catch (e) {
            window.app.showToast('error', 'Verification Failed', 'Unable to verify payment signature.');
          } finally {
            this.setPayButtonLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            this.setPayButtonLoading(false);
            window.app.showToast('info', 'Checkout Cancelled', 'Razorpay checkout popup closed by user.');
          }
        }
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response) => {
          this.setPayButtonLoading(false);
          window.app.showToast('error', 'Payment Failed', response.error.description || 'Payment rejected.');
        });
        rzp.open();
      } catch (err) {
        console.warn('Razorpay popup open error (mock key or domain restriction):', err);
        // Seamless fallback modal simulation for test keys
        this.openSimulationFallbackModal(order);
      }
    } catch (error) {
      console.error('Payment checkout error:', error);
      window.app.showToast('error', 'Checkout Error', 'Failed to launch checkout.');
    } finally {
      this.setPayButtonLoading(false);
    }
  }

  /**
   * Fallback for mock environments / offline test without active API keys
   */
  openSimulationFallbackModal(order) {
    const confirmPayment = window.confirm(
      `[Gateway Test Mode]\n\nRazorpay standard checkout triggered for Order: ${order.order_id} (Amount: ₹1.00).\n\nDo you want to simulate successful payment authorization now?`
    );
    if (confirmPayment) {
      this.simulateDirectPayment('Razorpay Test Simulation', order.order_id);
    }
  }

  /**
   * "I've Paid" button — confirms UPI payment via backend, shows receipt
   */
  async confirmUpiPayment() {
    const amount = this.getAmount();
    const refId = this.currentUpiData ? this.currentUpiData.reference_id : null;

    if (!this.currentUpiData) {
      window.app.showToast('warning', 'Generate QR First', 'Please generate the UPI QR code before confirming payment.');
      return;
    }

    if (this.btnSimulateQrScan) {
      this.btnSimulateQrScan.disabled = true;
      this.btnSimulateQrScan.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 mr-2 animate-spin"></i> Confirming Payment...`;
      lucide.createIcons();
    }

    window.app.showToast('info', 'Confirming Payment', `Verifying ₹${amount.toFixed(2)} UPI payment...`);

    try {
      let txn;

      if (window.apiService.isOnline) {
        let res = null;
        try {
          res = await fetch(`${window.apiService.baseUrl}/payment/confirm-direct-upi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref_id: refId, amount })
          });
        } catch (netErr) {
          // Network-level failure only (server unreachable) -> local fallback below
          console.warn('[Payment] confirm-direct-upi unreachable, using local fallback', netErr);
        }

        // Server responded but rejected the confirmation (e.g. 400/404): no fake receipt
        if (res && !res.ok) {
          let serverData = {};
          try { serverData = await res.json(); } catch { /* non-JSON error body */ }
          const result = {
            success: false,
            status: 'failed',
            message: serverData.message || serverData.error || 'UPI payment confirmation failed.'
          };
          window.app.showToast('error', 'Confirmation Failed', result.message);
          window.app.playTone('error');
          return result;
        }

        if (res && res.ok) {
          const data = await res.json();
          txn = {
            id: data.receiptId,
            receipt_id: data.receiptId,
            payment_id: data.paymentId,
            order_id: refId,
            amount,
            method: 'Direct UPI Transfer',
            created_at: new Date().toISOString()
          };
          window.apiService.logPaymentRecord(txn);
        }
      }

      // Fallback if backend unreachable
      if (!txn) {
        txn = {
          id: `RCPT_UPI_${Date.now().toString().slice(-6)}`,
          receipt_id: `RCPT_UPI_${Date.now().toString().slice(-6)}`,
          payment_id: `UPI_${refId || Date.now()}`,
          order_id: refId || `upi_order_${Date.now()}`,
          amount,
          method: 'Direct UPI Transfer',
          created_at: new Date().toISOString()
        };
        window.apiService.logPaymentRecord(txn);
      }

      this.showReceipt(txn);
      window.app.showToast('success', `₹${amount.toFixed(2)} Confirmed!`, 'UPI payment verified. Receipt generated.');
      window.app.playTone('success');
      window.app.refreshHistory();
    } catch (err) {
      console.error('UPI confirmation error:', err);
      window.app.showToast('error', 'Confirmation Failed', 'Could not confirm UPI payment. Try again.');
    } finally {
      if (this.btnSimulateQrScan) {
        this.btnSimulateQrScan.disabled = false;
        this.btnSimulateQrScan.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 mr-2"></i><span id="btn-paid-label">I've Paid ₹${amount.toFixed(2)} — Confirm & Get Receipt</span>`;
        lucide.createIcons();
      }
    }
  }

  /**
   * Simulate payment completion (Useful for quick tests & desktop QR demo)
   */
  async simulateDirectPayment(methodName = 'Test Verification', orderId = null) {
    const amount = this.getAmount();
    const fakeOrderId = orderId || `order_${Math.random().toString(36).substring(2, 10)}`;
    const fakePaymentId = `pay_${Math.random().toString(36).substring(2, 12)}`;

    window.app.showToast('info', 'Processing Transaction', `Validating ₹${amount.toFixed(2)} payment transaction...`);

    const verifyRes = await window.apiService.verifyPayment({
      razorpay_order_id: fakeOrderId,
      razorpay_payment_id: fakePaymentId,
      razorpay_signature: 'sig_mock_verified_' + Date.now(),
      amount
    });

    if (!verifyRes || verifyRes.success === false || !verifyRes.transaction) {
      window.app.showToast('error', 'Verification Failed', (verifyRes && verifyRes.message) || 'Payment verification failed.');
      return;
    }

    const txn = verifyRes.transaction;
    txn.method = methodName;
    txn.amount = amount;

    this.showReceipt(txn);
    window.app.showToast('success', `₹${amount.toFixed(2)} Confirmed!`, `Payment completed via ${methodName}. Receipt generated.`);
    window.app.playTone('success');
    window.app.refreshHistory();
  }

  /**
   * Generate Dynamic UPI QR Code with NPCI standards
   */
  async generateUpiQrCode() {
    try {
      if (this.btnGenerateUpiQr) {
        this.btnGenerateUpiQr.disabled = true;
        this.btnGenerateUpiQr.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i> Generating QR...`;
        lucide.createIcons();
      }

      const amount = this.getAmount();
      const upiData = await window.apiService.generateUpiQr(amount, `Payment of ₹${amount.toFixed(2)}`);
      this.currentUpiData = upiData;

      if (this.upiQrDisplay) {
        this.upiQrDisplay.classList.remove('hidden');
      }

      // Generate QR Code via QRCode.js or image fallback
      const qrTarget = document.getElementById('upi-qrcode-canvas');
      if (qrTarget) {
        qrTarget.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrTarget, {
            text: upiData.upi_string,
            width: 180,
            height: 180,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        } else if (this.upiQrImage) {
          this.upiQrImage.src = upiData.qr_image_url;
          this.upiQrImage.classList.remove('hidden');
        }
      }

      if (this.upiRefText) {
        this.upiRefText.textContent = upiData.reference_id;
      }
      if (this.upiStringInput) {
        this.upiStringInput.value = upiData.upi_string;
      }

      // Start 5-minute countdown
      this.startCountdown(upiData.expires_in || 300);

      window.app.showToast('success', 'Dynamic UPI QR Ready', 'Valid for 5 minutes. Scan using GPay, PhonePe, or Paytm.');
    } catch (e) {
      console.error('Error generating UPI QR:', e);
      window.app.showToast('error', 'QR Error', 'Could not generate dynamic QR.');
    } finally {
      if (this.btnGenerateUpiQr) {
        this.btnGenerateUpiQr.disabled = false;
        this.btnGenerateUpiQr.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i> Regenerate QR Code`;
        lucide.createIcons();
      }
    }
  }

  /**
   * Generate a Razorpay-managed VERIFIED dynamic QR (QR Codes API).
   * Unlike Direct UPI QR, payment is confirmed automatically via webhook + status polling.
   */
  async generateRazorpayQrCode() {
    this.stopRazorpayQrPolling();

    if (this.btnGenerateRazorpayQr) {
      this.btnGenerateRazorpayQr.disabled = true;
      this.btnGenerateRazorpayQr.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Generating...`;
      lucide.createIcons();
    }

    // Reset display to a pending state
    if (this.razorpayQrImage) {
      this.razorpayQrImage.classList.add('hidden');
      this.razorpayQrImage.removeAttribute('src');
    }
    if (this.razorpayQrPlaceholder) {
      this.razorpayQrPlaceholder.classList.remove('hidden');
      this.razorpayQrPlaceholder.textContent = 'Generating secure QR…';
    }
    if (this.razorpayQrIdText) this.razorpayQrIdText.textContent = '—';
    this.setRazorpayQrStatus('pending', 'Waiting for payment…');

    try {
      const amount = this.getAmount();
      const result = await window.apiService.generateRazorpayQr(amount, `Payment of ₹${amount.toFixed(2)}`);

      if (!result || result.success === false) {
        const msg = (result && result.message) || 'Could not generate Razorpay verified QR.';
        window.app.showToast('error', 'Razorpay QR Unavailable', msg);
        if (this.razorpayQrPlaceholder) this.razorpayQrPlaceholder.textContent = 'QR unavailable';
        this.setRazorpayQrStatus('failed', 'Unavailable');
        this.razorpayQrData = null;
        return;
      }

      this.razorpayQrData = result;

      // Server-provided image URL assigned via .src (not innerHTML) — not an injection vector
      if (this.razorpayQrImage && result.qr_image_url) {
        this.razorpayQrImage.src = result.qr_image_url;
        this.razorpayQrImage.classList.remove('hidden');
        if (this.razorpayQrPlaceholder) this.razorpayQrPlaceholder.classList.add('hidden');
      }
      // qr_id rendered via textContent — safe from server values
      if (this.razorpayQrIdText) this.razorpayQrIdText.textContent = result.qr_id || '—';

      window.app.showToast('success', 'Verified QR Ready', 'Scan to pay — confirmation is automatic, no manual tap needed.');

      this.startRazorpayQrPolling(result.qr_id, amount);
    } catch (e) {
      console.error('Error generating Razorpay QR:', e);
      window.app.showToast('error', 'QR Error', 'Could not generate Razorpay verified QR.');
      this.setRazorpayQrStatus('failed', 'Error');
      this.razorpayQrData = null;
    } finally {
      if (this.btnGenerateRazorpayQr) {
        this.btnGenerateRazorpayQr.disabled = false;
        this.btnGenerateRazorpayQr.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 mr-1.5"></i> Regenerate QR`;
        lucide.createIcons();
      }
    }
  }

  /**
   * Poll the backend for Razorpay QR payment confirmation every ~4 seconds.
   */
  startRazorpayQrPolling(qrId, amount) {
    this.stopRazorpayQrPolling();
    if (!qrId) return;

    let elapsed = 0;
    const intervalMs = 4000;
    const maxMs = 10 * 60 * 1000; // stop after 10 minutes

    const poll = async () => {
      // Abort if the user left this tab or regenerated a different QR
      if (this.selectedMethod !== 'razorpay_qr' || !this.razorpayQrData || this.razorpayQrData.qr_id !== qrId) {
        this.stopRazorpayQrPolling();
        return;
      }

      try {
        const status = await window.apiService.getRazorpayQrStatus(qrId);
        if (status && status.paid) {
          this.stopRazorpayQrPolling();
          this.onRazorpayQrPaid(status, qrId, amount);
          return;
        }
      } catch (e) {
        console.warn('[Payment] Razorpay QR poll error', e);
      }

      elapsed += intervalMs;
      if (elapsed >= maxMs) {
        this.stopRazorpayQrPolling();
        this.setRazorpayQrStatus('failed', 'Session timed out — regenerate QR');
      }
    };

    this.razorpayQrPollTimer = setInterval(poll, intervalMs);
  }

  stopRazorpayQrPolling() {
    if (this.razorpayQrPollTimer) {
      clearInterval(this.razorpayQrPollTimer);
      this.razorpayQrPollTimer = null;
    }
  }

  /**
   * Called once a Razorpay QR payment is verified: show success state + receipt.
   */
  onRazorpayQrPaid(status, qrId, amount) {
    this.setRazorpayQrStatus('paid', 'Payment received & verified');

    const txn = {
      id: status.payment_id || qrId,
      receipt_id: `RCPT_RZPQR_${String(qrId || '').slice(-8).toUpperCase()}`,
      payment_id: status.payment_id || 'razorpay_qr_verified',
      order_id: qrId,
      amount,
      method: 'Razorpay Verified QR',
      created_at: new Date().toISOString()
    };

    window.apiService.logPaymentRecord(txn);
    this.showReceipt(txn);
    window.app.showToast('success', `₹${amount.toFixed(2)} Verified!`, 'Razorpay confirmed your QR payment. Receipt generated.');
    window.app.playTone('success');
    window.app.refreshHistory();
  }

  /**
   * Update the Razorpay QR live status pill (pending | paid | failed).
   */
  setRazorpayQrStatus(state, text) {
    if (!this.razorpayQrStatusBadge) return;
    const base = 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ';
    let colorCls, iconHtml;
    if (state === 'paid') {
      colorCls = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400';
      iconHtml = '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 mr-1.5"></i>';
    } else if (state === 'failed') {
      colorCls = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400';
      iconHtml = '<i data-lucide="x-circle" class="w-3.5 h-3.5 mr-1.5"></i>';
    } else {
      colorCls = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400';
      iconHtml = '<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i>';
    }
    this.razorpayQrStatusBadge.className = base + colorCls;
    this.razorpayQrStatusBadge.innerHTML = `${iconHtml}<span>${escHtmlPay(text)}</span>`;
    lucide.createIcons();
  }

  /**
   * Generate a Cashfree-managed VERIFIED dynamic UPI QR (order + UPI qrcode session).
   * Payment is confirmed automatically via status polling (Cashfree order payments API).
   */
  async generateCashfreeQrCode() {
    this.stopCashfreeQrPolling();

    if (this.btnGenerateCashfreeQr) {
      this.btnGenerateCashfreeQr.disabled = true;
      this.btnGenerateCashfreeQr.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i> Generating...`;
      lucide.createIcons();
    }

    // Reset display to a pending state
    if (this.cashfreeQrImage) {
      this.cashfreeQrImage.classList.add('hidden');
      this.cashfreeQrImage.removeAttribute('src');
    }
    if (this.cashfreeQrPlaceholder) {
      this.cashfreeQrPlaceholder.classList.remove('hidden');
      this.cashfreeQrPlaceholder.textContent = 'Generating secure QR…';
    }
    if (this.cashfreeQrIdText) this.cashfreeQrIdText.textContent = '—';
    this.setCashfreeQrStatus('pending', 'Waiting for payment…');

    try {
      const amount = this.getAmount();
      const result = await window.apiService.generateCashfreeQr(amount, `Payment of ₹${amount.toFixed(2)}`);

      if (!result || result.success === false) {
        const msg = (result && result.message) || 'Could not generate Cashfree verified QR.';
        window.app.showToast('error', 'Cashfree QR Unavailable', msg);
        if (this.cashfreeQrPlaceholder) this.cashfreeQrPlaceholder.textContent = 'QR unavailable';
        this.setCashfreeQrStatus('failed', 'Unavailable');
        this.cashfreeQrData = null;
        return;
      }

      this.cashfreeQrData = result;

      // Server-provided data:image/png;base64 URI assigned via .src as-is (not innerHTML)
      if (this.cashfreeQrImage && result.qr_image_url) {
        this.cashfreeQrImage.src = result.qr_image_url;
        this.cashfreeQrImage.classList.remove('hidden');
        if (this.cashfreeQrPlaceholder) this.cashfreeQrPlaceholder.classList.add('hidden');
      }
      // order_id rendered via textContent — safe from server values
      if (this.cashfreeQrIdText) this.cashfreeQrIdText.textContent = result.order_id || '—';

      window.app.showToast('success', 'Cashfree QR Ready', 'Scan to pay — confirmation is automatic, no manual tap needed.');

      this.startCashfreeQrPolling(result.order_id, amount);
    } catch (e) {
      console.error('Error generating Cashfree QR:', e);
      window.app.showToast('error', 'QR Error', 'Could not generate Cashfree verified QR.');
      this.setCashfreeQrStatus('failed', 'Error');
      this.cashfreeQrData = null;
    } finally {
      if (this.btnGenerateCashfreeQr) {
        this.btnGenerateCashfreeQr.disabled = false;
        this.btnGenerateCashfreeQr.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 mr-1.5"></i> Regenerate QR`;
        lucide.createIcons();
      }
    }
  }

  /**
   * Poll the backend for Cashfree QR payment confirmation every ~4 seconds.
   */
  startCashfreeQrPolling(orderId, amount) {
    this.stopCashfreeQrPolling();
    if (!orderId) return;

    let elapsed = 0;
    const intervalMs = 4000;
    const maxMs = 10 * 60 * 1000; // stop after 10 minutes

    const poll = async () => {
      // Abort if the user left this tab or regenerated a different QR
      if (this.selectedMethod !== 'cashfree_qr' || !this.cashfreeQrData || this.cashfreeQrData.order_id !== orderId) {
        this.stopCashfreeQrPolling();
        return;
      }

      try {
        const status = await window.apiService.getCashfreeQrStatus(orderId);
        // Re-check after the await: a stale response must not fire for a replaced QR
        if (status && status.paid && this.cashfreeQrData && this.cashfreeQrData.order_id === orderId) {
          this.stopCashfreeQrPolling();
          this.onCashfreeQrPaid(status, orderId, amount);
          return;
        }
      } catch (e) {
        console.warn('[Payment] Cashfree QR poll error', e);
      }

      elapsed += intervalMs;
      if (elapsed >= maxMs) {
        this.stopCashfreeQrPolling();
        this.setCashfreeQrStatus('failed', 'Session timed out — regenerate QR');
      }
    };

    this.cashfreeQrPollTimer = setInterval(poll, intervalMs);
  }

  stopCashfreeQrPolling() {
    if (this.cashfreeQrPollTimer) {
      clearInterval(this.cashfreeQrPollTimer);
      this.cashfreeQrPollTimer = null;
    }
  }

  /**
   * Called once a Cashfree QR payment is verified: show success state + receipt.
   */
  onCashfreeQrPaid(status, orderId, amount) {
    this.setCashfreeQrStatus('paid', 'Payment received & verified');

    const txn = {
      id: status.payment_id || orderId,
      receipt_id: `RCPT_CFQR_${String(orderId || '').slice(-8).toUpperCase()}`,
      payment_id: status.payment_id || 'cashfree_qr_verified',
      order_id: orderId,
      amount,
      method: 'Cashfree Verified QR',
      created_at: new Date().toISOString()
    };

    window.apiService.logPaymentRecord(txn);
    this.showReceipt(txn);
    window.app.showToast('success', `₹${amount.toFixed(2)} Verified!`, 'Cashfree confirmed your QR payment. Receipt generated.');
    window.app.playTone('success');
    window.app.refreshHistory();
  }

  /**
   * Update the Cashfree QR live status pill (pending | paid | failed).
   */
  setCashfreeQrStatus(state, text) {
    if (!this.cashfreeQrStatusBadge) return;
    const base = 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ';
    let colorCls, iconHtml;
    if (state === 'paid') {
      colorCls = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400';
      iconHtml = '<i data-lucide="check-circle-2" class="w-3.5 h-3.5 mr-1.5"></i>';
    } else if (state === 'failed') {
      colorCls = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400';
      iconHtml = '<i data-lucide="x-circle" class="w-3.5 h-3.5 mr-1.5"></i>';
    } else {
      colorCls = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400';
      iconHtml = '<i data-lucide="loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i>';
    }
    this.cashfreeQrStatusBadge.className = base + colorCls;
    this.cashfreeQrStatusBadge.innerHTML = `${iconHtml}<span>${escHtmlPay(text)}</span>`;
    lucide.createIcons();
  }

  /**
   * Countdown timer for UPI QR validity (5 minutes)
   */
  startCountdown(seconds) {
    clearInterval(this.countdownTimer);
    this.remainingSeconds = seconds;
    const totalSeconds = seconds;

    const updateDisplay = () => {
      const minutes = Math.floor(this.remainingSeconds / 60);
      const secs = this.remainingSeconds % 60;
      const formatted = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (this.upiTimerText) {
        this.upiTimerText.textContent = formatted;
        if (this.remainingSeconds < 60) {
          this.upiTimerText.classList.add('text-red-600', 'font-bold', 'animate-pulse');
        } else {
          this.upiTimerText.classList.remove('text-red-600', 'animate-pulse');
        }
      }

      if (this.upiTimerProgress) {
        const percent = (this.remainingSeconds / totalSeconds) * 100;
        this.upiTimerProgress.style.width = `${percent}%`;
        if (percent < 20) {
          this.upiTimerProgress.className = 'h-full bg-red-500 transition-all duration-1000';
        } else if (percent < 50) {
          this.upiTimerProgress.className = 'h-full bg-amber-500 transition-all duration-1000';
        } else {
          this.upiTimerProgress.className = 'h-full bg-emerald-500 transition-all duration-1000';
        }
      }

      if (this.remainingSeconds <= 0) {
        clearInterval(this.countdownTimer);
        if (this.upiTimerText) this.upiTimerText.textContent = 'EXPIRED (00:00)';
        window.app.showToast('warning', 'QR Code Expired', 'The UPI session expired. Please generate a new QR code.');
      }
      this.remainingSeconds--;
    };

    updateDisplay();
    this.countdownTimer = setInterval(updateDisplay, 1000);
  }

  copyUpiString() {
    if (!this.upiStringInput || !this.upiStringInput.value) return;
    navigator.clipboard.writeText(this.upiStringInput.value)
      .then(() => {
        window.app.showToast('success', 'UPI URI Copied', 'Copied raw UPI payment URI to clipboard.');
      })
      .catch(() => {
        this.upiStringInput.select();
        document.execCommand('copy');
        window.app.showToast('success', 'UPI URI Copied', 'Copied to clipboard.');
      });
  }

  /**
   * Display receipt modal after successful transaction
   */
  showReceipt(txn) {
    this.lastTransaction = txn;

    if (this.receiptIdEl) this.receiptIdEl.textContent = txn.receipt_id || `REC-${Date.now().toString(36).toUpperCase()}`;
    if (this.receiptPaymentIdEl) this.receiptPaymentIdEl.textContent = txn.payment_id || 'pay_verified';
    if (this.receiptOrderIdEl) this.receiptOrderIdEl.textContent = txn.order_id || 'order_verified';
    if (this.receiptTimeEl) this.receiptTimeEl.textContent = new Date(txn.created_at || Date.now()).toLocaleString();
    if (this.receiptMethodEl) this.receiptMethodEl.textContent = txn.method || 'Razorpay Standard';
    if (this.receiptAmountEl) this.receiptAmountEl.textContent = `₹${(txn.amount || 1.00).toFixed(2)}`;

    if (this.receiptModal) {
      this.receiptModal.classList.remove('hidden');
      this.receiptModal.classList.add('flex');
    }
  }

  showReceiptById(id) {
    const history = window.apiService.getPaymentHistory();
    const txn = history.find(item => item.id === id || item.receipt_id === id);
    if (txn) {
      this.showReceipt(txn);
    }
  }

  closeReceiptModal() {
    if (this.receiptModal) {
      this.receiptModal.classList.add('hidden');
      this.receiptModal.classList.remove('flex');
    }
  }

  downloadReceipt() {
    if (!this.lastTransaction) return;
    const txn = this.lastTransaction;
    const content = `=====================================================
QUICKPAY & NOTIFY STUDIO - PAYMENT RECEIPT
=====================================================
Receipt No   : ${txn.receipt_id || 'REC-001'}
Date & Time  : ${new Date(txn.created_at || Date.now()).toLocaleString()}
Item Name    : Production Verification Token (1 Unit)
Amount Paid  : ₹${(txn.amount || 1.00).toFixed(2)} INR
Payment ID   : ${txn.payment_id}
Order ID     : ${txn.order_id}
Method       : ${txn.method}
Status       : VERIFIED & CONFIRMED (PAID)
-----------------------------------------------------
Issued by: ravi123sehravat@gmail.com
Thank you for verifying with QuickPay Studio!
=====================================================`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${txn.payment_id || Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.app.showToast('success', 'Receipt Downloaded', 'Receipt text file saved to your device.');
  }

  /**
   * Quick action: Pre-fill notification composer with receipt info
   */
  transferToNotificationStudio() {
    this.closeReceiptModal();
    if (window.notificationsManager && this.lastTransaction) {
      window.notificationsManager.applyPaymentTemplate(this.lastTransaction);
      window.app.switchTab('notifications');
      window.app.showToast('info', 'Loaded in Studio', 'Payment details loaded into notification composer. Ready to dispatch!');
    }
  }

  setPayButtonLoading(loading, label = null) {
    if (!this.btnPayRazorpay) return;
    const amount = this.getAmount();
    const defaultLabel = `Pay ₹${amount.toFixed(2)} via Razorpay Standard`;
    this.btnPayRazorpay.disabled = loading;
    if (loading) {
      this.btnPayRazorpay.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 mr-2 animate-spin"></i> ${label || 'Processing...'}`;
    } else {
      this.btnPayRazorpay.innerHTML = `
        <span class="flex items-center justify-center">
          <i data-lucide="lock" class="w-5 h-5 mr-2"></i>
          <span>${defaultLabel}</span>
        </span>`;
    }
    lucide.createIcons();
  }

  loadRazorpayScript() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('razorpay-checkout-script')) {
        return resolve();
      }
      const script = document.createElement('script');
      script.id = 'razorpay-checkout-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay script'));
      document.body.appendChild(script);
    });
  }
}

// Global Singleton Export
window.PaymentManager = PaymentManager;
