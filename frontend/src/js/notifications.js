/**
 * QuickPay & Notify Studio - Notification & Messaging Studio Module
 * Manages 2 pre-configured recipient slots, multi-channel dispatch (Email, WhatsApp, SMS),
 * template application, placeholder interpolation, and real-time status matrix.
 */

class NotificationsManager {
  constructor() {
    this.recipients = [];
    this.selectedChannels = new Set(['email', 'whatsapp', 'sms']);
    this.isDispatching = false;

    this.initElements();
    this.bindEvents();
    this.loadRecipients();
  }

  initElements() {
    // Recipient Slots Form Elements
    this.r1Name = document.getElementById('rec1-name');
    this.r1Phone = document.getElementById('rec1-phone');
    this.r1Whatsapp = document.getElementById('rec1-whatsapp');
    this.r1Email = document.getElementById('rec1-email');

    this.r2Name = document.getElementById('rec2-name');
    this.r2Phone = document.getElementById('rec2-phone');
    this.r2Whatsapp = document.getElementById('rec2-whatsapp');
    this.r2Email = document.getElementById('rec2-email');

    this.btnSaveRecipients = document.getElementById('btn-save-recipients');
    this.btnResetRecipients = document.getElementById('btn-reset-recipients');

    // Message Composer
    this.subjectInput = document.getElementById('msg-subject');
    this.messageInput = document.getElementById('msg-body');
    this.charCountEl = document.getElementById('msg-char-count');
    this.previewBox = document.getElementById('msg-preview-box');

    // Quick Templates
    this.tplPayment = document.getElementById('tpl-btn-payment');
    this.tplHello = document.getElementById('tpl-btn-hello');
    this.tplAlert = document.getElementById('tpl-btn-alert');
    this.tplClear = document.getElementById('tpl-btn-clear');

    // Tag Insert Buttons
    this.tagInsertButtons = document.querySelectorAll('.tag-insert-btn');

    // Channel Checkboxes
    this.chkEmail = document.getElementById('channel-chk-email');
    this.chkWhatsapp = document.getElementById('channel-chk-whatsapp');
    this.chkSms = document.getElementById('channel-chk-sms');

    // Action Button
    this.btnDispatch = document.getElementById('btn-dispatch-all');

    // Progress & Matrix elements
    this.dispatchStatusCard = document.getElementById('dispatch-status-card');
    this.dispatchProgressLog = document.getElementById('dispatch-progress-log');

    // Status Badges in Matrix
    this.matrixR1Email = document.getElementById('matrix-r1-email');
    this.matrixR1Whatsapp = document.getElementById('matrix-r1-whatsapp');
    this.matrixR1Sms = document.getElementById('matrix-r1-sms');
    this.matrixR2Email = document.getElementById('matrix-r2-email');
    this.matrixR2Whatsapp = document.getElementById('matrix-r2-whatsapp');
    this.matrixR2Sms = document.getElementById('matrix-r2-sms');
  }

  bindEvents() {
    // Save & Reset recipients
    if (this.btnSaveRecipients) {
      this.btnSaveRecipients.addEventListener('click', () => this.saveRecipients());
    }
    if (this.btnResetRecipients) {
      this.btnResetRecipients.addEventListener('click', () => this.resetRecipientsToDefault());
    }

    // Channel toggles
    const handleChannelToggle = (channel, checked) => {
      if (checked) {
        this.selectedChannels.add(channel);
      } else {
        this.selectedChannels.delete(channel);
      }
      this.updateDispatchButtonState();
    };

    if (this.chkEmail) this.chkEmail.addEventListener('change', (e) => handleChannelToggle('email', e.target.checked));
    if (this.chkWhatsapp) this.chkWhatsapp.addEventListener('change', (e) => handleChannelToggle('whatsapp', e.target.checked));
    if (this.chkSms) this.chkSms.addEventListener('change', (e) => handleChannelToggle('sms', e.target.checked));

    // Live preview & character counter
    if (this.messageInput) {
      this.messageInput.addEventListener('input', () => this.updatePreview());
    }
    if (this.subjectInput) {
      this.subjectInput.addEventListener('input', () => this.updatePreview());
    }

    // Template Buttons
    if (this.tplPayment) {
      this.tplPayment.addEventListener('click', () => this.applyPaymentTemplate());
    }
    if (this.tplHello) {
      this.tplHello.addEventListener('click', () => this.applyHelloTemplate());
    }
    if (this.tplAlert) {
      this.tplAlert.addEventListener('click', () => this.applyAlertTemplate());
    }
    if (this.tplClear) {
      this.tplClear.addEventListener('click', () => this.clearComposer());
    }

    // Insert Placeholders into Message Textarea
    this.tagInsertButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.currentTarget.getAttribute('data-tag');
        this.insertTag(tag);
      });
    });

    // Dispatch button
    if (this.btnDispatch) {
      this.btnDispatch.addEventListener('click', () => this.dispatchParallel());
    }
  }

  async loadRecipients() {
    try {
      this.recipients = await window.apiService.getRecipients();
      this.populateRecipientFields();
      this.updatePreview();
    } catch (err) {
      console.error('Failed to load recipients:', err);
    }
  }

  populateRecipientFields() {
    const r1 = this.recipients[0] || {};
    const r2 = this.recipients[1] || {};

    if (this.r1Name) this.r1Name.value = r1.name || '';
    if (this.r1Phone) this.r1Phone.value = r1.phone || '';
    if (this.r1Whatsapp) this.r1Whatsapp.value = r1.whatsapp || '';
    if (this.r1Email) this.r1Email.value = r1.email || '';

    const r1Label = document.getElementById('rec1-display-name');
    if (r1Label) r1Label.textContent = r1.name || 'Recipient 1';
    const previewNameLabel = document.getElementById('preview-recipient-name');
    if (previewNameLabel) previewNameLabel.textContent = r1.name || 'Recipient 1';

    if (this.r2Name) this.r2Name.value = r2.name || '';
    if (this.r2Phone) this.r2Phone.value = r2.phone || '';
    if (this.r2Whatsapp) this.r2Whatsapp.value = r2.whatsapp || '';
    if (this.r2Email) this.r2Email.value = r2.email || '';

    const r2Label = document.getElementById('rec2-display-name');
    if (r2Label) r2Label.textContent = r2.name || 'Recipient 2';

    // Update delivery matrix row labels
    const mr1Name = document.getElementById('matrix-r1-name');
    if (mr1Name) mr1Name.textContent = r1.name || 'Recipient 1';
    const mr1Email = document.getElementById('matrix-r1-email-label');
    if (mr1Email) mr1Email.textContent = r1.email || '';
    const mr2Name = document.getElementById('matrix-r2-name');
    if (mr2Name) mr2Name.textContent = r2.name || 'Recipient 2';
    const mr2Email = document.getElementById('matrix-r2-email-label');
    if (mr2Email) mr2Email.textContent = r2.email || '';
  }

  getRecipientsFromFields() {
    return [
      {
        id: 1,
        name: this.r1Name ? this.r1Name.value.trim() : 'Recipient 1',
        phone: this.r1Phone ? this.r1Phone.value.trim() : '',
        whatsapp: this.r1Whatsapp ? this.r1Whatsapp.value.trim() : '',
        email: this.r1Email ? this.r1Email.value.trim() : '',
        role: 'Primary Account / Admin'
      },
      {
        id: 2,
        name: this.r2Name ? this.r2Name.value.trim() : 'Recipient 2',
        phone: this.r2Phone ? this.r2Phone.value.trim() : '',
        whatsapp: this.r2Whatsapp ? this.r2Whatsapp.value.trim() : '',
        email: this.r2Email ? this.r2Email.value.trim() : '',
        role: 'Secondary Recipient / QA'
      }
    ];
  }

  async saveRecipients() {
    this.recipients = this.getRecipientsFromFields();
    if (this.btnSaveRecipients) {
      this.btnSaveRecipients.disabled = true;
      this.btnSaveRecipients.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i> Saving...`;
      lucide.createIcons();
    }

    try {
      const res = await window.apiService.saveRecipients(this.recipients);
      this.populateRecipientFields();
      window.app.showToast('success', 'Recipients Saved', 'Address book updated for both recipients.');
    } catch (e) {
      window.app.showToast('error', 'Save Failed', 'Could not save recipient changes.');
    } finally {
      if (this.btnSaveRecipients) {
        this.btnSaveRecipients.disabled = false;
        this.btnSaveRecipients.innerHTML = `<i data-lucide="save" class="w-4 h-4 mr-2"></i> Save Recipient Details`;
        lucide.createIcons();
      }
    }
  }

  resetRecipientsToDefault() {
    const defaults = [
      {
        id: 1,
        name: 'Pratishtha',
        phone: '+917355062427',
        whatsapp: '+917355062427',
        email: 'pratishthavsingh123@gmail.com',
        role: 'Primary Account / Admin'
      },
      {
        id: 2,
        name: 'Ravi',
        phone: '+918769030475',
        whatsapp: '+918769030475',
        email: 'kajupretty2202@gmail.com',
        role: 'Secondary Recipient / QA'
      }
    ];
    this.recipients = defaults;
    this.populateRecipientFields();
    window.apiService.saveRecipients(defaults);
    window.app.showToast('info', 'Defaults Restored', 'Recipient slots restored to default configuration.');
  }

  insertTag(tag) {
    if (!this.messageInput) return;
    const cursorPos = this.messageInput.selectionStart;
    const textBefore = this.messageInput.value.substring(0, cursorPos);
    const textAfter = this.messageInput.value.substring(cursorPos);
    this.messageInput.value = textBefore + tag + textAfter;
    this.messageInput.focus();
    this.messageInput.setSelectionRange(cursorPos + tag.length, cursorPos + tag.length);
    this.updatePreview();
  }

  updatePreview() {
    const rawSubject = this.subjectInput ? this.subjectInput.value : '';
    const rawBody = this.messageInput ? this.messageInput.value : '';
    
    // Character count
    if (this.charCountEl) {
      this.charCountEl.textContent = `${rawBody.length} characters`;
    }

    if (!this.previewBox) return;

    const r1 = (this.recipients && this.recipients[0]) ? this.recipients[0] : { name: 'Recipient 1' };
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Replace placeholders
    const amountInput = document.getElementById('payment-amount-input');
    const liveAmount = amountInput ? `₹${parseFloat(amountInput.value || 1).toFixed(2)}` : '₹1.00';
    const renderedBody = rawBody
      .replace(/\{name\}/g, r1.name || 'Valued User')
      .replace(/\{time\}/g, now)
      .replace(/\{amount\}/g, liveAmount)
      .replace(/\{status\}/g, 'CONFIRMED');

    const renderedSubject = rawSubject
      .replace(/\{name\}/g, r1.name || 'Valued User')
      .replace(/\{amount\}/g, liveAmount);

    this.previewBox.innerHTML = `
      <div class="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
        <div><strong class="text-blue-600 dark:text-blue-400">Subject:</strong> ${renderedSubject || '<em class="text-slate-400">No subject provided</em>'}</div>
        <div class="pt-1 border-t border-slate-200 dark:border-slate-800 whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200 leading-relaxed">${renderedBody || '<em class="text-slate-400">Start typing in the composer to view live preview...</em>'}</div>
      </div>
    `;
  }

  applyPaymentTemplate(txn = null) {
    const txnId = txn ? txn.payment_id : `pay_${Math.random().toString(36).substring(2, 9)}`;
    const amountInput = document.getElementById('payment-amount-input');
    const amt = txn ? (txn.amount || parseFloat(amountInput?.value || 1)) : parseFloat(amountInput?.value || 1);
    const amtStr = `₹${parseFloat(amt).toFixed(2)}`;

    if (this.subjectInput) {
      this.subjectInput.value = `✅ Payment Received: ${amtStr} - Production Verification Token`;
    }
    if (this.messageInput) {
      this.messageInput.value = `Hi {name},\n\nYour transaction of ${amtStr} for Production Verification Token has been successfully verified & confirmed.\n\nTransaction ID: ${txnId}\nStatus: {status}\nTimestamp: {time}\nSender: ${window.apiService.senderEmail}\n\nThank you for using QuickPay & Notify Studio.`;
    }
    this.updatePreview();
    window.app.showToast('info', 'Template Applied', `Payment Confirmation ${amtStr} template loaded.`);
  }

  applyHelloTemplate() {
    if (this.subjectInput) {
      this.subjectInput.value = `👋 Hello from QuickPay Multi-Channel Studio`;
    }
    if (this.messageInput) {
      this.messageInput.value = `Hello {name},\n\nThis is a live multi-channel broadcast test from the QuickPay & Notify Studio.\n\nAll notification pipelines (Gmail SMTP, WhatsApp, and SMS Gateway) are functional.\nTime: {time}\n\nHave a great day!`;
    }
    this.updatePreview();
    window.app.showToast('info', 'Template Applied', 'Hello Test Message template loaded.');
  }

  applyAlertTemplate() {
    if (this.subjectInput) {
      this.subjectInput.value = `🚨 URGENT: System Verification Health Alert`;
    }
    if (this.messageInput) {
      this.messageInput.value = `ATTENTION {name}:\n\nA high-priority system health verification has been executed on the production cluster.\n\nStatus: {status}\nLogged at: {time}\nOrigin: ${window.apiService.senderEmail}\n\nNo manual action required.`;
    }
    this.updatePreview();
    window.app.showToast('info', 'Template Applied', 'Urgent Alert template loaded.');
  }

  clearComposer() {
    if (this.subjectInput) this.subjectInput.value = '';
    if (this.messageInput) this.messageInput.value = '';
    this.updatePreview();
    window.app.showToast('info', 'Composer Cleared', 'Subject and message inputs cleared.');
  }

  updateDispatchButtonState() {
    if (!this.btnDispatch) return;
    if (this.selectedChannels.size === 0) {
      this.btnDispatch.disabled = true;
      this.btnDispatch.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      this.btnDispatch.disabled = false;
      this.btnDispatch.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  /**
   * Parallel Multi-channel dispatch to both recipients
   */
  async dispatchParallel() {
    if (this.isDispatching) return;

    const subject = this.subjectInput ? this.subjectInput.value.trim() : '';
    const message = this.messageInput ? this.messageInput.value.trim() : '';

    if (!message) {
      window.app.showToast('warning', 'Message Required', 'Please enter a message before dispatching.');
      return;
    }
    if (this.selectedChannels.size === 0) {
      window.app.showToast('warning', 'No Channels Selected', 'Select at least one delivery channel (Email, WhatsApp, or SMS).');
      return;
    }

    this.isDispatching = true;
    this.recipients = this.getRecipientsFromFields();

    // Show Progress Card & Reset Matrix Badges
    if (this.dispatchStatusCard) {
      this.dispatchStatusCard.classList.remove('hidden');
    }
    this.resetMatrixToPending();

    if (this.btnDispatch) {
      this.btnDispatch.disabled = true;
      this.btnDispatch.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 mr-2 animate-spin"></i> Dispatching Broadcast...`;
      lucide.createIcons();
    }

    this.logProgress(`[INIT] Preparing parallel dispatch to 2 recipients across ${this.selectedChannels.size} channel(s)...`);

    try {
      const amountInputEl = document.getElementById('payment-amount-input');
      const currentAmount = amountInputEl ? parseFloat(amountInputEl.value || 1) : 1;
      const payload = {
        recipients: this.recipients,
        channels: Array.from(this.selectedChannels),
        subject: subject || 'QuickPay Multi-Channel Notification',
        message: message,
        amount: currentAmount
      };

      const dispatchResponse = await window.apiService.dispatchNotifications(payload);

      // Animate each recipient and channel result in the status matrix
      const results = dispatchResponse.results || [];
      await this.animateDispatchResults(results);

      const sentCount = results.filter(r => r.status === 'sent' || r.status === 'success').length;
      const simCount = results.filter(r => r.status === 'simulated').length;
      const failCount = results.filter(r => r.status === 'failed').length;
      const summary = [`${sentCount} sent`];
      if (simCount) summary.push(`${simCount} simulated`);
      if (failCount) summary.push(`${failCount} failed`);
      const toastType = failCount === results.length ? 'error' : sentCount > 0 ? 'success' : 'warning';
      window.app.showToast(toastType, 'Broadcast Complete', summary.join(', ') + '.');
      window.app.playTone('success');
      window.app.refreshHistory();
    } catch (err) {
      console.error('Dispatch failed:', err);
      window.app.showToast('error', 'Dispatch Error', 'An error occurred during notification broadcast.');
    } finally {
      this.isDispatching = false;
      if (this.btnDispatch) {
        this.btnDispatch.disabled = false;
        this.btnDispatch.innerHTML = `
          <i data-lucide="send" class="w-5 h-5 mr-2"></i>
          <span>🚀 Dispatch to Both Recipients (Parallel)</span>`;
        lucide.createIcons();
      }
    }
  }

  resetMatrixToPending() {
    const setPending = (badgeEl, channelActive) => {
      if (!badgeEl) return;
      if (!channelActive) {
        badgeEl.innerHTML = `<span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">Disabled</span>`;
      } else {
        badgeEl.innerHTML = `<span class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium animate-pulse"><i data-lucide="loader" class="w-3 h-3 mr-1 animate-spin"></i> In Queue</span>`;
      }
    };

    setPending(this.matrixR1Email, this.selectedChannels.has('email'));
    setPending(this.matrixR1Whatsapp, this.selectedChannels.has('whatsapp'));
    setPending(this.matrixR1Sms, this.selectedChannels.has('sms'));

    setPending(this.matrixR2Email, this.selectedChannels.has('email'));
    setPending(this.matrixR2Whatsapp, this.selectedChannels.has('whatsapp'));
    setPending(this.matrixR2Sms, this.selectedChannels.has('sms'));

    lucide.createIcons();
  }

  async animateDispatchResults(results) {
    for (const item of results) {
      await new Promise(r => setTimeout(r, 200));

      const isR1 = (item.recipientName || item.recipient_name) === this.recipients[0].name;
      let badgeEl = null;

      if (isR1) {
        if (item.channel === 'email') badgeEl = this.matrixR1Email;
        if (item.channel === 'whatsapp') badgeEl = this.matrixR1Whatsapp;
        if (item.channel === 'sms') badgeEl = this.matrixR1Sms;
      } else {
        if (item.channel === 'email') badgeEl = this.matrixR2Email;
        if (item.channel === 'whatsapp') badgeEl = this.matrixR2Whatsapp;
        if (item.channel === 'sms') badgeEl = this.matrixR2Sms;
      }

      if (badgeEl) {
        const status = item.status;
        if (status === 'sent' || status === 'success') {
          badgeEl.innerHTML = `<span class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium"><i data-lucide="check-circle-2" class="w-3 h-3 mr-1"></i> Sent</span>`;
        } else if (status === 'simulated') {
          badgeEl.innerHTML = `<span class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium" title="Simulated — credentials not configured"><i data-lucide="eye" class="w-3 h-3 mr-1"></i> Simulated</span>`;
        } else {
          badgeEl.innerHTML = `<span class="inline-flex items-center text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-medium" title="${item.error || item.detail || ''}"><i data-lucide="x-circle" class="w-3 h-3 mr-1"></i> Failed</span>`;
        }
      }

      this.logProgress(`[${item.channel.toUpperCase()}] ${item.recipientName || item.recipient_name}: ${item.status.toUpperCase()} -> ${item.detail || item.error || item.notice || ''}`);
      lucide.createIcons();
    }
  }

  logProgress(text) {
    if (!this.dispatchProgressLog) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'font-mono text-xs py-0.5 text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/50';
    entry.textContent = `[${time}] ${text}`;
    this.dispatchProgressLog.prepend(entry);
  }
}

// Global Singleton Export
window.NotificationsManager = NotificationsManager;
