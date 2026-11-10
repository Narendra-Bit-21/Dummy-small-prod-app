/**
 * QuickPay & Notify Studio - Payment Checkout Module
 * Handles Amazon/Flipkart style checkout, Razorpay standard gateway,
 * Dynamic UPI QR code generation, countdown timers, and receipt printing.
 */

class PaymentManager {
  constructor() {
    this.selectedMethod = 'razorpay'; // 'razorpay' | 'upi_qr'
    this.countdownTimer = null;
    this.remainingSeconds = 300; // 5 minutes
    this.currentOrder = null;
    this.lastTransaction = null;
    this.currentUpiData = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // Payment Method selection tabs/radios
    this.methodRazorpayBtn = document.getElementById('method-razorpay-btn');
    this.methodUpiQrBtn = document.getElementById('method-upiqr-btn');
    this.razorpayContainer = document.getElementById('razorpay-method-view');
    this.upiqrContainer = document.getElementById('upiqr-method-view');

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

    // Simulate QR Scan Payment
    if (this.btnSimulateQrScan) {
      this.btnSimulateQrScan.addEventListener('click', () => this.simulateDirectPayment('Direct UPI QR'));
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

    if (method === 'razorpay') {
      this.methodRazorpayBtn.classList.add('border-blue-600', 'bg-blue-50/50', 'dark:bg-blue-900/20');
      this.methodRazorpayBtn.classList.remove('border-slate-200', 'dark:border-slate-700');
      this.methodUpiQrBtn.classList.remove('border-blue-600', 'bg-blue-50/50', 'dark:bg-blue-900/20');
      this.methodUpiQrBtn.classList.add('border-slate-200', 'dark:border-slate-700');

      this.razorpayContainer.classList.remove('hidden');
      this.upiqrContainer.classList.add('hidden');
    } else {
      this.methodUpiQrBtn.classList.add('border-blue-600', 'bg-blue-50/50', 'dark:bg-blue-900/20');
      this.methodUpiQrBtn.classList.remove('border-slate-200', 'dark:border-slate-700');
      this.methodRazorpayBtn.classList.remove('border-blue-600', 'bg-blue-50/50', 'dark:bg-blue-900/20');
      this.methodRazorpayBtn.classList.add('border-slate-200', 'dark:border-slate-700');

      this.razorpayContainer.classList.add('hidden');
      this.upiqrContainer.classList.remove('hidden');

      // Auto generate UPI QR if not generated yet
      if (!this.currentUpiData) {
        this.generateUpiQrCode();
      }
    }
  }

  /**
   * Start Razorpay Standard Checkout Popup
   */
  async startRazorpayPayment() {
    try {
      this.setPayButtonLoading(true, 'Initializing Gateway...');

      // 1. Create order on backend / mock
      const order = await window.apiService.createPaymentOrder(1.00);
      this.currentOrder = order;

      // 2. Check if Razorpay script is loaded
      if (typeof window.Razorpay === 'undefined') {
        await this.loadRazorpayScript();
      }

      // Check if Razorpay key is valid or mock test key
      const keyId = window.apiService.razorpayKeyId;

      const options = {
        key: keyId,
        amount: order.amount || 100, // 100 paise = ₹1.00
        currency: order.currency || 'INR',
        name: 'QuickPay & Notify Studio',
        description: 'Production Verification Token (₹1.00)',
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
        handler: async (response) => {
          this.setPayButtonLoading(true, 'Verifying Payment...');
          try {
            const verifyRes = await window.apiService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            this.showReceipt(verifyRes.transaction || {
              id: `txn_${Date.now()}`,
              order_id: response.razorpay_order_id,
              payment_id: response.razorpay_payment_id,
              amount: 1.00,
              method: 'Razorpay Gateway',
              created_at: new Date().toISOString()
            });

            window.app.showToast('success', 'Payment Verified!', '₹1.00 payment received and signature verified successfully.');
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
   * Simulate payment completion (Useful for quick tests & desktop QR demo)
   */
  async simulateDirectPayment(methodName = 'Test Verification', orderId = null) {
    const fakeOrderId = orderId || `order_${Math.random().toString(36).substring(2, 10)}`;
    const fakePaymentId = `pay_${Math.random().toString(36).substring(2, 12)}`;
    
    window.app.showToast('info', 'Processing Transaction', 'Validating ₹1.00 payment transaction...');

    const verifyRes = await window.apiService.verifyPayment({
      razorpay_order_id: fakeOrderId,
      razorpay_payment_id: fakePaymentId,
      razorpay_signature: 'sig_mock_verified_' + Date.now()
    });

    const txn = verifyRes.transaction;
    txn.method = methodName;

    this.showReceipt(txn);
    window.app.showToast('success', '₹1.00 Received!', `Payment completed via ${methodName}. Receipt generated.`);
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

      const upiData = await window.apiService.generateUpiQr(1.00, 'Verification Token');
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

  setPayButtonLoading(loading, label = 'Pay ₹1.00') {
    if (!this.btnPayRazorpay) return;
    this.btnPayRazorpay.disabled = loading;
    if (loading) {
      this.btnPayRazorpay.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 mr-2 animate-spin"></i> ${label}`;
    } else {
      this.btnPayRazorpay.innerHTML = `
        <span class="flex items-center justify-center">
          <i data-lucide="lock" class="w-5 h-5 mr-2"></i>
          <span>Pay ₹1.00 via Razorpay Standard</span>
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
