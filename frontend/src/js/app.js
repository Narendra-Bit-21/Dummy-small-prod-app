/**
 * QuickPay & Notify Studio - Main Application Controller
 * Manages tabs, dark mode, toast notifications, audio synthesis,
 * history tables, and environment state.
 */

function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function paymentStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'success' || s === 'captured') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                <i data-lucide="check" class="w-3 h-3 mr-1"></i> ${s === 'success' ? 'Success' : 'Paid'}
              </span>`;
  }
  if (s === 'pending' || s === 'created') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                <i data-lucide="clock" class="w-3 h-3 mr-1"></i> ${s === 'created' ? 'Created' : 'Pending'}
              </span>`;
  }
  if (s === 'failed') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
                <i data-lucide="x" class="w-3 h-3 mr-1"></i> Failed
              </span>`;
  }
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                ${escHtml(status || 'Unknown')}
              </span>`;
}

class AppController {
  constructor() {
    this.currentTab = 'checkout';
    this.audioCtx = null;
    // Per-table sort state (default: newest first)
    this.historySort = {
      payments: { key: 'created_at', dir: 'desc' },
      notifs: { key: 'timestamp', dir: 'desc' }
    };

    this.initTheme();
    this.initElements();
    this.bindEvents();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('qp_theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('qp_theme', isDark ? 'dark' : 'light');
    this.updateThemeButtonIcon();
    this.showToast('info', 'Theme Changed', `Switched to ${isDark ? 'Dark' : 'Light'} mode.`);
  }

  updateThemeButtonIcon() {
    const iconContainer = document.getElementById('theme-toggle-icon');
    if (!iconContainer) return;
    const isDark = document.documentElement.classList.contains('dark');
    iconContainer.innerHTML = isDark 
      ? '<i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>'
      : '<i data-lucide="moon" class="w-4 h-4 text-slate-600"></i>';
    lucide.createIcons();
  }

  initElements() {
    // Navigation Tabs
    this.tabCheckoutBtn = document.getElementById('nav-tab-checkout');
    this.tabNotifBtn = document.getElementById('nav-tab-notifications');
    this.tabLogsBtn = document.getElementById('nav-tab-logs');

    this.sectionCheckout = document.getElementById('section-checkout');
    this.sectionNotifications = document.getElementById('section-notifications');
    this.sectionLogs = document.getElementById('section-logs');

    // Environment Toggle
    this.envToggleBtn = document.getElementById('env-toggle-btn');
    this.envBadge = document.getElementById('env-badge');

    // API Status Indicator
    this.apiStatusIndicator = document.getElementById('api-status-indicator');
    this.apiStatusText = document.getElementById('api-status-text');

    // Theme Toggle
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');

    // Toast Container
    this.toastContainer = document.getElementById('toast-container');

    // History Table Elements
    this.historySubtabPayments = document.getElementById('subtab-history-payments');
    this.historySubtabNotifs = document.getElementById('subtab-history-notifs');
    this.tablePaymentsContainer = document.getElementById('table-payments-view');
    this.tableNotifsContainer = document.getElementById('table-notifs-view');
    this.historySearchInput = document.getElementById('history-search');
    this.historyStatusFilter = document.getElementById('history-status-filter');
    this.btnExportCsv = document.getElementById('btn-export-csv');
    this.btnClearLogs = document.getElementById('btn-clear-logs');
  }

  bindEvents() {
    // Tab Switching
    if (this.tabCheckoutBtn) {
      this.tabCheckoutBtn.addEventListener('click', () => this.switchTab('checkout'));
    }
    if (this.tabNotifBtn) {
      this.tabNotifBtn.addEventListener('click', () => this.switchTab('notifications'));
    }
    if (this.tabLogsBtn) {
      this.tabLogsBtn.addEventListener('click', () => this.switchTab('logs'));
    }

    // Theme Toggle
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Environment Switcher
    if (this.envToggleBtn) {
      this.envToggleBtn.addEventListener('click', () => this.toggleEnvironment());
    }

    // History Subtabs
    if (this.historySubtabPayments) {
      this.historySubtabPayments.addEventListener('click', () => this.switchHistorySubtab('payments'));
    }
    if (this.historySubtabNotifs) {
      this.historySubtabNotifs.addEventListener('click', () => this.switchHistorySubtab('notifs'));
    }

    // History Filters
    if (this.historySearchInput) {
      this.historySearchInput.addEventListener('input', () => this.renderHistoryTables());
    }
    if (this.historyStatusFilter) {
      this.historyStatusFilter.addEventListener('change', () => this.renderHistoryTables());
    }

    // Sortable column headers
    ['payments', 'notifs'].forEach(table => {
      const thead = document.getElementById(`${table}-thead`);
      if (!thead) return;
      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const state = this.historySort[table];
        if (state.key === th.dataset.sort) {
          state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.key = th.dataset.sort;
          state.dir = 'asc';
        }
        this.renderHistoryTables();
      });
    });

    // Export CSV
    if (this.btnExportCsv) {
      this.btnExportCsv.addEventListener('click', () => this.exportHistoryToCsv());
    }

    // Clear Logs
    if (this.btnClearLogs) {
      this.btnClearLogs.addEventListener('click', () => this.clearHistoryLogs());
    }

    // Register API Status Listener
    window.apiService.onStatusChange((isOnline, env) => {
      this.updateApiStatusUI(isOnline, env);
    });
  }

  async init() {
    this.updateThemeButtonIcon();
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Check API Health
    await window.apiService.checkHealth();
    this.updateApiStatusUI(window.apiService.isOnline, window.apiService.environment);

    // Initial render of history tables
    this.renderHistoryTables();

    // Periodic health check every 15s
    setInterval(() => {
      window.apiService.checkHealth();
    }, 15000);
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Reset tab button styles
    [this.tabCheckoutBtn, this.tabNotifBtn, this.tabLogsBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('nav-tab-active', 'border-b-2', 'border-blue-600', 'text-blue-600', 'font-semibold');
      btn.classList.add('text-slate-600', 'dark:text-slate-400');
    });

    // Hide all sections
    [this.sectionCheckout, this.sectionNotifications, this.sectionLogs].forEach(sec => {
      if (sec) sec.classList.add('hidden');
    });

    if (tabName === 'checkout') {
      if (this.tabCheckoutBtn) {
        this.tabCheckoutBtn.classList.add('nav-tab-active', 'border-b-2', 'border-blue-600', 'text-blue-600', 'font-semibold');
        this.tabCheckoutBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
      }
      if (this.sectionCheckout) this.sectionCheckout.classList.remove('hidden');
    } else if (tabName === 'notifications') {
      if (this.tabNotifBtn) {
        this.tabNotifBtn.classList.add('nav-tab-active', 'border-b-2', 'border-blue-600', 'text-blue-600', 'font-semibold');
        this.tabNotifBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
      }
      if (this.sectionNotifications) this.sectionNotifications.classList.remove('hidden');
    } else if (tabName === 'logs') {
      if (this.tabLogsBtn) {
        this.tabLogsBtn.classList.add('nav-tab-active', 'border-b-2', 'border-blue-600', 'text-blue-600', 'font-semibold');
        this.tabLogsBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
      }
      if (this.sectionLogs) this.sectionLogs.classList.remove('hidden');
      this.renderHistoryTables();
    }

    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleEnvironment() {
    const current = window.apiService.environment;
    const next = current === 'sandbox' ? 'production' : 'sandbox';
    window.apiService.setEnvironment(next);
    this.updateApiStatusUI(window.apiService.isOnline, next);
    this.showToast(
      next === 'production' ? 'warning' : 'info',
      'Environment Updated',
      `Switched to ${next.toUpperCase()} mode.`
    );
  }

  updateApiStatusUI(isOnline, env) {
    if (this.envBadge) {
      if (env === 'production') {
        this.envBadge.textContent = 'PROD (Live)';
        this.envBadge.className = 'px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800';
      } else {
        this.envBadge.textContent = 'SANDBOX (₹1 Test)';
        this.envBadge.className = 'px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
      }
    }

    if (this.apiStatusIndicator && this.apiStatusText) {
      if (isOnline) {
        this.apiStatusIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse';
        this.apiStatusText.textContent = 'Backend Connected';
        this.apiStatusText.className = 'text-xs font-medium text-emerald-700 dark:text-emerald-400';
      } else {
        this.apiStatusIndicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
        this.apiStatusText.textContent = 'Standalone / Demo Mode';
        this.apiStatusText.className = 'text-xs font-medium text-amber-700 dark:text-amber-400';
      }
    }
  }

  switchHistorySubtab(subtab) {
    if (subtab === 'payments') {
      this.historySubtabPayments.classList.add('bg-white', 'dark:bg-slate-800', 'shadow-sm', 'text-blue-600', 'font-semibold');
      this.historySubtabPayments.classList.remove('text-slate-500');
      this.historySubtabNotifs.classList.remove('bg-white', 'dark:bg-slate-800', 'shadow-sm', 'text-blue-600', 'font-semibold');
      this.historySubtabNotifs.classList.add('text-slate-500');

      this.tablePaymentsContainer.classList.remove('hidden');
      this.tableNotifsContainer.classList.add('hidden');
    } else {
      this.historySubtabNotifs.classList.add('bg-white', 'dark:bg-slate-800', 'shadow-sm', 'text-blue-600', 'font-semibold');
      this.historySubtabNotifs.classList.remove('text-slate-500');
      this.historySubtabPayments.classList.remove('bg-white', 'dark:bg-slate-800', 'shadow-sm', 'text-blue-600', 'font-semibold');
      this.historySubtabPayments.classList.add('text-slate-500');

      this.tablePaymentsContainer.classList.add('hidden');
      this.tableNotifsContainer.classList.remove('hidden');
    }
  }

  refreshHistory() {
    this.renderHistoryTables();
  }

  // Returns a sorted copy of rows per this.historySort[table] and refreshes header arrows
  sortHistoryRows(table, rows) {
    const { key, dir } = this.historySort[table];
    const getVal = (r) => {
      if (key === 'created_at' || key === 'timestamp') return new Date(r[key]).getTime() || 0;
      if (key === 'amount') return Number(r.amount) || 0;
      if (key === 'receipt_id') return String(r.receipt_id || r.id || '').toLowerCase();
      return String(r[key] ?? '').toLowerCase();
    };
    const mult = dir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      return va < vb ? -mult : va > vb ? mult : 0;
    });

    const thead = document.getElementById(`${table}-thead`);
    if (thead) {
      thead.querySelectorAll('th[data-sort]').forEach(th => {
        const active = th.dataset.sort === key;
        const ind = th.querySelector('.sort-indicator');
        if (ind) {
          ind.textContent = active ? (dir === 'asc' ? '↑' : '↓') : '↕';
          ind.className = `sort-indicator ml-1 ${active ? 'text-blue-600 dark:text-blue-400' : 'opacity-30'}`;
        }
        th.setAttribute('aria-sort', active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    }
    return sorted;
  }

  renderHistoryTables() {
    const searchTerm = (this.historySearchInput ? this.historySearchInput.value : '').toLowerCase();
    const statusFilter = this.historyStatusFilter ? this.historyStatusFilter.value : 'all';

    // 1. Render Payments Table
    const payments = window.apiService.getPaymentHistory();
    const filteredPayments = this.sortHistoryRows('payments', payments.filter(p => {
      const matchesSearch = !searchTerm || 
        (p.payment_id && p.payment_id.toLowerCase().includes(searchTerm)) ||
        (p.order_id && p.order_id.toLowerCase().includes(searchTerm)) ||
        (p.method && p.method.toLowerCase().includes(searchTerm));
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    }));

    const paymentsTbody = document.getElementById('payments-tbody');
    if (paymentsTbody) {
      if (filteredPayments.length === 0) {
        paymentsTbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-8 text-center text-slate-400">
              <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
              No payment transactions found. Trigger a ₹1 payment to record history.
            </td>
          </tr>`;
      } else {
        paymentsTbody.innerHTML = filteredPayments.map(p => `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition">
            <td class="px-6 py-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
              ${escHtml(p.receipt_id || p.id)}
            </td>
            <td class="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
              ${escHtml(new Date(p.created_at).toLocaleString())}
            </td>
            <td class="px-6 py-4 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span class="inline-flex items-center">
                <i data-lucide="credit-card" class="w-3.5 h-3.5 mr-1.5 text-blue-500"></i>
                ${escHtml(p.method || 'Standard')}
              </span>
            </td>
            <td class="px-6 py-4 text-xs font-bold text-slate-900 dark:text-white">
              ₹${(Number(p.amount) || 1).toFixed(2)}
            </td>
            <td class="px-6 py-4 text-xs">
              ${paymentStatusBadge(p.status)}
            </td>
            <td class="px-6 py-4 text-xs text-right">
              <button data-receipt-id="${escHtml(p.id)}" class="btn-view-receipt px-2.5 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium transition cursor-pointer">
                View Receipt
              </button>
            </td>
          </tr>
        `).join('');
      }
      // Delegated click handler (avoids injecting server data into inline JS)
      if (!paymentsTbody.dataset.receiptHandlerBound) {
        paymentsTbody.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-view-receipt');
          if (btn && window.paymentManager) {
            window.paymentManager.showReceiptById(btn.dataset.receiptId);
          }
        });
        paymentsTbody.dataset.receiptHandlerBound = '1';
      }
    }

    // 2. Render Notifications Table
    const notifs = window.apiService.getNotificationHistory();
    const filteredNotifs = this.sortHistoryRows('notifs', notifs.filter(n => {
      const matchesSearch = !searchTerm ||
        (n.recipient_name && n.recipient_name.toLowerCase().includes(searchTerm)) ||
        (n.recipient_target && n.recipient_target.toLowerCase().includes(searchTerm)) ||
        (n.channel && n.channel.toLowerCase().includes(searchTerm)) ||
        (n.subject && n.subject.toLowerCase().includes(searchTerm));
      const matchesStatus = statusFilter === 'all' || n.status === statusFilter;
      return matchesSearch && matchesStatus;
    }));

    const notifsTbody = document.getElementById('notifs-tbody');
    if (notifsTbody) {
      if (filteredNotifs.length === 0) {
        notifsTbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-8 text-center text-slate-400">
              <i data-lucide="send" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
              No notification dispatches logged. Send a broadcast to generate audit logs.
            </td>
          </tr>`;
      } else {
        notifsTbody.innerHTML = filteredNotifs.map(n => `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition">
            <td class="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
              ${escHtml(new Date(n.timestamp).toLocaleTimeString())}
            </td>
            <td class="px-6 py-4 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <div>${escHtml(n.recipient_name)}</div>
              <div class="text-[11px] font-normal text-slate-400 font-mono">${escHtml(n.recipient_target)}</div>
            </td>
            <td class="px-6 py-4 text-xs font-medium">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] uppercase font-semibold ${
                n.channel === 'email' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' :
                n.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
              }">
                ${escHtml(n.channel)}
              </span>
            </td>
            <td class="px-6 py-4 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate" title="${escHtml(n.subject || '')}">
              ${escHtml(n.subject || 'Multi-channel broadcast')}
            </td>
            <td class="px-6 py-4 text-xs">
              ${(n.status === 'sent' || n.status === 'success')
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                     <i data-lucide="check" class="w-3 h-3 mr-1"></i> Delivered
                   </span>`
                : n.status === 'simulated'
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300" title="Simulated — credentials not configured">
                     <i data-lucide="eye" class="w-3 h-3 mr-1"></i> Simulated
                   </span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300" title="${escHtml(n.detail || n.error || '')}">
                     <i data-lucide="alert-triangle" class="w-3 h-3 mr-1"></i> Failed
                   </span>`
              }
            </td>
            <td class="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title="${escHtml(n.detail || '')}">
              ${escHtml(n.detail || 'Dispatched via gateway')}
            </td>
          </tr>
        `).join('');
      }
    }

    lucide.createIcons();
  }

  exportHistoryToCsv() {
    const payments = window.apiService.getPaymentHistory();
    const notifs = window.apiService.getNotificationHistory();

    if (payments.length === 0 && notifs.length === 0) {
      this.showToast('info', 'No Data to Export', 'There are no payment or notification records to export yet.');
      return;
    }

    let csv = '=== PAYMENT TRANSACTIONS ===\n';
    csv += 'Receipt ID,Order ID,Payment ID,Amount (INR),Method,Status,Created At\n';
    payments.forEach(p => {
      csv += `"${p.receipt_id || ''}","${p.order_id || ''}","${p.payment_id || ''}","${p.amount || 1.00}","${p.method || ''}","${p.status || ''}","${p.created_at || ''}"\n`;
    });

    csv += '\n=== NOTIFICATION AUDIT LOGS ===\n';
    csv += 'Batch ID,Recipient Name,Recipient Target,Channel,Status,Subject,Timestamp,Detail\n';
    notifs.forEach(n => {
      csv += `"${n.batch_id || ''}","${n.recipient_name || ''}","${n.recipient_target || ''}","${n.channel || ''}","${n.status || ''}","${(n.subject || '').replace(/"/g, '""')}","${n.timestamp || ''}","${(n.detail || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `quickpay_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.showToast('success', 'Export Complete', 'Audit log exported to CSV successfully.');
  }

  clearHistoryLogs() {
    const confirmClear = window.confirm('Are you sure you want to clear all payment and notification audit logs?');
    if (confirmClear) {
      window.apiService.clearAuditLogs();
      this.renderHistoryTables();
      this.showToast('info', 'Logs Cleared', 'All audit activity records have been reset.');
    }
  }

  /**
   * Floating Toast Notifications System
   */
  showToast(type = 'info', title = '', message = '') {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-enter flex items-start p-4 rounded-xl shadow-lg border max-w-sm w-full transition-all duration-300 pointer-events-auto ${
      type === 'success' ? 'bg-white dark:bg-slate-900 border-emerald-500 text-slate-800 dark:text-slate-100' :
      type === 'error' ? 'bg-white dark:bg-slate-900 border-red-500 text-slate-800 dark:text-slate-100' :
      type === 'warning' ? 'bg-white dark:bg-slate-900 border-amber-500 text-slate-800 dark:text-slate-100' :
      'bg-white dark:bg-slate-900 border-blue-500 text-slate-800 dark:text-slate-100'
    }`;

    const iconColor = 
      type === 'success' ? 'text-emerald-500' :
      type === 'error' ? 'text-red-500' :
      type === 'warning' ? 'text-amber-500' : 'text-blue-500';

    const iconName = 
      type === 'success' ? 'check-circle' :
      type === 'error' ? 'alert-circle' :
      type === 'warning' ? 'alert-triangle' : 'info';

    toast.innerHTML = `
      <div class="mr-3 mt-0.5 flex-shrink-0 ${iconColor}">
        <i data-lucide="${iconName}" class="w-5 h-5"></i>
      </div>
      <div class="flex-1 mr-2">
        <h4 class="font-semibold text-sm leading-tight">${escHtml(title)}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">${escHtml(message)}</p>
      </div>
      <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -mr-1 -mt-1 transition">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    const removeToast = () => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener('click', removeToast);
    this.toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(removeToast, 4000);
  }

  /**
   * Synthesize audio tone using Web Audio API
   */
  playTone(type = 'success') {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio autoplay policy or unavailable
    }
  }
}

// Global App Instance & Initialization
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
  window.paymentManager = new PaymentManager();
  window.notificationsManager = new NotificationsManager();
  window.app.init();
});
