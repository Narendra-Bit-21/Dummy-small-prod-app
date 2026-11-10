const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  // SQLite binary not available, will use robust JSON file store fallback
  sqlite3 = null;
}

class DatabaseManager {
  constructor() {
    this.mode = 'uninitialized'; // 'sqlite' or 'json'
    this.sqliteDb = null;
    this.jsonFilePath = null;
    this.jsonCache = {
      recipients: [],
      payments: [],
      notifications: []
    };
  }

  async init() {
    const dbDir = path.dirname(config.databasePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (sqlite3) {
      try {
        await this._initSqlite(config.databasePath);
        this.mode = 'sqlite';
        console.log(`[Database] Connected to SQLite database at ${config.databasePath}`);
        await this._seedRecipientsIfEmpty();
        return;
      } catch (sqliteErr) {
        console.warn(`[Database] SQLite initialization failed (${sqliteErr.message}). Switching to JSON storage engine.`);
      }
    }

    // JSON file-based database fallback
    this.mode = 'json';
    this.jsonFilePath = config.databasePath.endsWith('.db')
      ? config.databasePath.replace(/\.db$/, '.json')
      : `${config.databasePath}.json`;

    this._initJson();
    console.log(`[Database] Operating in persistent JSON storage mode at ${this.jsonFilePath}`);
    await this._seedRecipientsIfEmpty();
  }

  // -------------------------------------------------------------
  // SQLite Native Initialization
  // -------------------------------------------------------------
  _initSqlite(dbPath) {
    return new Promise((resolve, reject) => {
      this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);

        // Execute table creation
        const schema = `
          CREATE TABLE IF NOT EXISTS recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            whatsapp TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL UNIQUE,
            payment_id TEXT,
            amount REAL NOT NULL DEFAULT 1.00,
            currency TEXT NOT NULL DEFAULT 'INR',
            status TEXT NOT NULL,
            method TEXT NOT NULL,
            upi_uri TEXT,
            signature TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_id INTEGER,
            recipient_name TEXT,
            recipient_target TEXT,
            channel TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            external_id TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `;

        this.sqliteDb.exec(schema, (execErr) => {
          if (execErr) return reject(execErr);
          resolve();
        });
      });
    });
  }

  // -------------------------------------------------------------
  // JSON File Storage Fallback Engine
  // -------------------------------------------------------------
  _initJson() {
    if (fs.existsSync(this.jsonFilePath)) {
      try {
        const raw = fs.readFileSync(this.jsonFilePath, 'utf8');
        this.jsonCache = JSON.parse(raw);
        if (!Array.isArray(this.jsonCache.recipients)) this.jsonCache.recipients = [];
        if (!Array.isArray(this.jsonCache.payments)) this.jsonCache.payments = [];
        if (!Array.isArray(this.jsonCache.notifications)) this.jsonCache.notifications = [];
      } catch (e) {
        console.error(`[Database] Error parsing existing JSON db: ${e.message}. Initializing empty store.`);
        this._saveJsonSync();
      }
    } else {
      this._saveJsonSync();
    }
  }

  _saveJsonSync() {
    try {
      fs.writeFileSync(this.jsonFilePath, JSON.stringify(this.jsonCache, null, 2), 'utf8');
    } catch (err) {
      console.error(`[Database] Failed to write JSON database: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // Seeding
  // -------------------------------------------------------------
  async _seedRecipientsIfEmpty() {
    const recipients = await this.getRecipients();
    if (!recipients || recipients.length === 0) {
      console.log('[Database] Seeding initial 2 recipient records...');
      const seedRecipients = [
        {
          name: 'Pratishtha',
          email: 'pratishthavsingh123@gmail.com',
          phone: '+917355062427',
          whatsapp: '+917355062427'
        },
        {
          name: 'Ravi',
          email: 'kajupretty2202@gmail.com',
          phone: '+918769030475',
          whatsapp: '+918769030475'
        }
      ];

      for (const r of seedRecipients) {
        await this.addRecipient(r);
      }
    }
  }

  // -------------------------------------------------------------
  // Recipient Methods
  // -------------------------------------------------------------
  async getRecipients() {
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.sqliteDb.all('SELECT * FROM recipients ORDER BY id ASC', [], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }

    return [...this.jsonCache.recipients].sort((a, b) => a.id - b.id);
  }

  async getRecipientById(id) {
    const numId = parseInt(id, 10);
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.sqliteDb.get('SELECT * FROM recipients WHERE id = ?', [numId], (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      });
    }

    return this.jsonCache.recipients.find((r) => r.id === numId) || null;
  }

  async addRecipient(data) {
    const now = new Date().toISOString();
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        const stmt = this.sqliteDb.prepare(
          'INSERT INTO recipients (name, email, phone, whatsapp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        stmt.run([data.name, data.email, data.phone, data.whatsapp, now, now], function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, ...data, created_at: now, updated_at: now });
        });
      });
    }

    const nextId = this.jsonCache.recipients.length > 0
      ? Math.max(...this.jsonCache.recipients.map((r) => r.id)) + 1
      : 1;
    const newRecord = {
      id: nextId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      whatsapp: data.whatsapp,
      created_at: now,
      updated_at: now
    };
    this.jsonCache.recipients.push(newRecord);
    this._saveJsonSync();
    return newRecord;
  }

  async updateRecipient(id, updates) {
    const numId = parseInt(id, 10);
    const now = new Date().toISOString();

    if (this.mode === 'sqlite') {
      const existing = await this.getRecipientById(numId);
      if (!existing) return null;

      const name = updates.name !== undefined ? updates.name : existing.name;
      const email = updates.email !== undefined ? updates.email : existing.email;
      const phone = updates.phone !== undefined ? updates.phone : existing.phone;
      const whatsapp = updates.whatsapp !== undefined ? updates.whatsapp : existing.whatsapp;

      return new Promise((resolve, reject) => {
        const query = `
          UPDATE recipients
          SET name = ?, email = ?, phone = ?, whatsapp = ?, updated_at = ?
          WHERE id = ?
        `;
        this.sqliteDb.run(query, [name, email, phone, whatsapp, now, numId], function (err) {
          if (err) return reject(err);
          resolve({ id: numId, name, email, phone, whatsapp, updated_at: now });
        });
      });
    }

    const index = this.jsonCache.recipients.findIndex((r) => r.id === numId);
    if (index === -1) return null;

    this.jsonCache.recipients[index] = {
      ...this.jsonCache.recipients[index],
      ...updates,
      id: numId,
      updated_at: now
    };
    this._saveJsonSync();
    return this.jsonCache.recipients[index];
  }

  // -------------------------------------------------------------
  // Payment Methods
  // -------------------------------------------------------------
  async createPayment(paymentData) {
    const now = new Date().toISOString();
    const {
      order_id,
      payment_id = null,
      amount = 1.00,
      currency = 'INR',
      status = 'created',
      method = 'razorpay',
      upi_uri = null,
      signature = null,
      notes = null
    } = paymentData;

    const notesStr = typeof notes === 'object' ? JSON.stringify(notes) : notes;

    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO payments (order_id, payment_id, amount, currency, status, method, upi_uri, signature, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [order_id, payment_id, amount, currency, status, method, upi_uri, signature, notesStr, now, now];
        this.sqliteDb.run(query, params, function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, order_id, ...paymentData, created_at: now, updated_at: now });
        });
      });
    }

    const nextId = this.jsonCache.payments.length > 0
      ? Math.max(...this.jsonCache.payments.map((p) => p.id || 0)) + 1
      : 1;
    const newRecord = {
      id: nextId,
      order_id,
      payment_id,
      amount,
      currency,
      status,
      method,
      upi_uri,
      signature,
      notes: notesStr,
      created_at: now,
      updated_at: now
    };
    this.jsonCache.payments.push(newRecord);
    this._saveJsonSync();
    return newRecord;
  }

  async updatePayment(order_id, updates) {
    const now = new Date().toISOString();

    if (this.mode === 'sqlite') {
      const existing = await this.getPaymentByOrderId(order_id);
      if (!existing) return null;

      const status = updates.status !== undefined ? updates.status : existing.status;
      const payment_id = updates.payment_id !== undefined ? updates.payment_id : existing.payment_id;
      const signature = updates.signature !== undefined ? updates.signature : existing.signature;
      const notes = updates.notes !== undefined
        ? (typeof updates.notes === 'object' ? JSON.stringify(updates.notes) : updates.notes)
        : existing.notes;

      return new Promise((resolve, reject) => {
        const query = `
          UPDATE payments
          SET status = ?, payment_id = ?, signature = ?, notes = ?, updated_at = ?
          WHERE order_id = ?
        `;
        this.sqliteDb.run(query, [status, payment_id, signature, notes, now, order_id], function (err) {
          if (err) return reject(err);
          resolve({ ...existing, ...updates, updated_at: now });
        });
      });
    }

    const index = this.jsonCache.payments.findIndex((p) => p.order_id === order_id);
    if (index === -1) return null;

    this.jsonCache.payments[index] = {
      ...this.jsonCache.payments[index],
      ...updates,
      updated_at: now
    };
    this._saveJsonSync();
    return this.jsonCache.payments[index];
  }

  async getPaymentByOrderId(order_id) {
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.sqliteDb.get('SELECT * FROM payments WHERE order_id = ?', [order_id], (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      });
    }

    return this.jsonCache.payments.find((p) => p.order_id === order_id) || null;
  }

  async getPayments(limit = 50) {
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.sqliteDb.all('SELECT * FROM payments ORDER BY id DESC LIMIT ?', [limit], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }

    return [...this.jsonCache.payments]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }

  // -------------------------------------------------------------
  // Notification Log Methods
  // -------------------------------------------------------------
  async logNotification(logData) {
    const timestamp = new Date().toISOString();
    const {
      recipient_id = null,
      recipient_name = '',
      recipient_target = '',
      channel,
      subject = '',
      message,
      status,
      error = null,
      external_id = null
    } = logData;

    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO notifications (recipient_id, recipient_name, recipient_target, channel, subject, message, status, error, external_id, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
          recipient_id,
          recipient_name,
          recipient_target,
          channel,
          subject,
          message,
          status,
          error,
          external_id,
          timestamp
        ];
        this.sqliteDb.run(query, params, function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, ...logData, timestamp });
        });
      });
    }

    const nextId = this.jsonCache.notifications.length > 0
      ? Math.max(...this.jsonCache.notifications.map((n) => n.id || 0)) + 1
      : 1;
    const newRecord = {
      id: nextId,
      recipient_id,
      recipient_name,
      recipient_target,
      channel,
      subject,
      message,
      status,
      error,
      external_id,
      timestamp
    };
    this.jsonCache.notifications.push(newRecord);
    this._saveJsonSync();
    return newRecord;
  }

  async getNotifications(limit = 100) {
    if (this.mode === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.sqliteDb.all('SELECT * FROM notifications ORDER BY id DESC LIMIT ?', [limit], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }

    return [...this.jsonCache.notifications]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  getHealth() {
    return {
      status: 'healthy',
      engine: this.mode,
      storagePath: this.mode === 'sqlite' ? config.databasePath : this.jsonFilePath,
      counts: {
        recipients: this.mode === 'sqlite' ? 'live' : this.jsonCache.recipients.length,
        payments: this.mode === 'sqlite' ? 'live' : this.jsonCache.payments.length,
        notifications: this.mode === 'sqlite' ? 'live' : this.jsonCache.notifications.length
      }
    };
  }
}

const db = new DatabaseManager();
module.exports = db;
