-- Database Schema for Production Notification & Payment App
-- Target: SQLite 3 / SQL-compliant database

-- Recipients Table: Stores the primary notification contacts
CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table: Tracks Razorpay transactions and NPCI Direct UPI QR requests
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL UNIQUE,
    payment_id TEXT,
    amount REAL NOT NULL DEFAULT 1.00,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK(status IN ('created', 'pending', 'paid', 'failed', 'refunded')),
    method TEXT NOT NULL CHECK(method IN ('razorpay', 'upi_direct')),
    upi_uri TEXT,
    signature TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table: Audit log for email, WhatsApp, and SMS messages dispatched
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER,
    recipient_name TEXT,
    recipient_target TEXT,
    channel TEXT NOT NULL CHECK(channel IN ('email', 'whatsapp', 'sms')),
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'simulated', 'queued')),
    error TEXT,
    external_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
