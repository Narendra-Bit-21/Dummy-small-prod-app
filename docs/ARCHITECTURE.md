# 🏗️ System Architecture & Engineering Design

This document details the architecture, component relationships, request lifecycle, data flow, and scaling roadmap for **QuickPay & Notify Studio**.

---

## 🏛️ System Overview

QuickPay & Notify Studio is built as a production-hardened micro-monolith designed to run within the constraints of the **AWS Free Tier (t2.micro / t3.micro with 1GB RAM)** while delivering high throughput, sub-50ms API responses, zero data loss, and multi-channel redundancy.

```mermaid
flowchart TD
    User["🌐 End User / Client Browser"] -->|HTTPS :443 / HTTP :80| Nginx["🛡️ Nginx 1.27 Reverse Proxy"]
    
    subgraph Host["AWS EC2 Free Tier (Ubuntu 24.04 LTS / t2.micro)"]
        subgraph DockerStack["Docker Compose Isolated Network"]
            Nginx -->|Gzip, SSL Term, Security Headers| Express["⚡ Node.js 20 LTS Application Server\n(Express.js :5000)"]
            
            subgraph BackendApp["Application Core"]
                Express --> Routes["API Routers\n/payment, /notifications, /recipients"]
                Routes --> Controllers["Controllers & Validation"]
                Controllers --> Services["Services\nPaymentService, NotificationService"]
            end

            Services -->|WAL Mode Read/Write| SQLite[("💾 SQLite 3 Database\n(/app/database/app.db)")]
        end

        SQLite -->|Docker Volume Mount| EBS[("📁 AWS EBS gp3 Storage\n(20GB Persistent Volume)")]
        Certbot["🔒 Certbot ACME Daemon"] -.->|Auto-Renews Every 12h| Nginx
    end

    subgraph ExternalServices["External Payment & Communication Gateways"]
        Services -->|HMAC SHA256 API| Razorpay["💳 Razorpay API\n(Orders, Captures, Webhooks)"]
        Services -->|Port 465 SSL / 587 TLS| Gmail["📧 Gmail SMTP\n(HTML Receipts)"]
        Services -->|Twilio REST API| Twilio["📱 Twilio Gateway\n(WhatsApp & SMS)"]
        Services -.->|Direct Intent URL| UPI["🇮🇳 NPCI UPI Network\n(GPay, PhonePe, Paytm, BHIM)"]
    end
```

---

## 🔁 Request Lifecycle & Payment Flows

### 1. Razorpay ₹1 Payment & Auto-Notification Flow
The sequence below illustrates the end-to-end payment creation, cryptographic signature verification, database persistence, and multi-channel notification dispatch.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer / User
    participant UI as Frontend Studio
    participant Proxy as Nginx Proxy
    participant Server as Express Server
    participant DB as SQLite DB
    participant RZP as Razorpay Gateway
    participant Notify as Notification Engine (Gmail & Twilio)

    Customer->>UI: Selects "Pay ₹1.00 via Razorpay"
    UI->>Proxy: POST /api/payment/create-order
    Proxy->>Server: Forward request
    Server->>RZP: POST /v1/orders (amount: 100 paise)
    RZP-->>Server: Return order_id (e.g., order_NpQ...)
    Server-->>UI: Return order_id & public key
    UI->>RZP: Open Razorpay Checkout Modal
    Customer->>RZP: Completes payment (UPI / Card / Netbanking)
    RZP-->>UI: Returns razorpay_payment_id, order_id, signature
    UI->>Server: POST /api/payment/verify
    
    Server->>Server: Compute HMAC-SHA256(order_id + "|" + payment_id, SECRET)
    alt Signature Valid
        Server->>DB: INSERT into payments (status='COMPLETED', amount=1.00)
        Server-->>UI: { success: true, message: "Payment verified" }
        
        par Async Multi-Channel Dispatch
            Server->>Notify: Send HTML Email receipt via Gmail SMTP
            Server->>Notify: Send WhatsApp receipt via Twilio Sandbox
            Server->>Notify: Send SMS confirmation
        end
        Notify-->>DB: INSERT into notifications_log (channel, recipient, status='DELIVERED')
    else Signature Invalid
        Server-->>UI: 400 Bad Request (Invalid signature)
        Server->>DB: INSERT into payments (status='FAILED')
    end
```

---

### 2. Direct NPCI UPI QR Fallback Flow (0% Fee, Zero KYC)
For scenarios where merchant onboarding is pending or users want 100% of the funds settled directly to their personal bank account:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer
    participant UI as Frontend Studio
    participant Server as Express Server
    participant DB as SQLite DB
    participant UPI as Customer UPI App (GPay/PhonePe)
    participant Notify as Notification Engine

    Customer->>UI: Selects "Direct UPI QR (0% Fee)"
    UI->>Server: POST /api/payment/upi-direct { recipient_email, recipient_phone }
    Server->>Server: Generate unique reference & NPCI string: upi://pay?pa=ravi123sehravat@okaxis...
    Server-->>UI: Returns generated QR code SVG + payment reference
    Customer->>UPI: Scans QR code and confirms ₹1.00 transfer
    UPI-->>Customer: Bank SMS with 12-digit UPI Ref / UTR
    Customer->>UI: Enters 12-digit UTR number & clicks "Confirm"
    UI->>Server: POST /api/payment/upi-confirm { reference, utr }
    Server->>DB: Update payment record to 'CONFIRMED'
    Server->>Notify: Trigger Email, WhatsApp, and SMS alerts
    Notify-->>Customer: Real-time receipt delivered on all channels!
```

---

## 🗄️ Database Architecture & Data Integrity

The application utilizes **SQLite 3** operating in **WAL (Write-Ahead Logging)** mode. SQLite provides serverless simplicity, zero memory overhead, and lightning-fast local reads/writes without needing a standalone MySQL or PostgreSQL daemon.

### WAL Mode Performance Benefits:
- **Concurrent Reads and Writes**: Readers do not block writers, and writers do not block readers.
- **ACID Durability**: Transactions are written to the `-wal` log file sequentially before atomic checkpointing.
- **Low Memory Footprint**: Uses only 5–15 MB of RAM compared to 150–300 MB for MySQL/PostgreSQL, making it perfect for 1GB RAM EC2 instances.

### Core Database Entities:

```mermaid
erDiagram
    PAYMENTS ||--o{ NOTIFICATIONS_LOG : triggers
    RECIPIENTS ||--o{ PAYMENTS : initiates
    
    PAYMENTS {
        string id PK
        string order_id
        string payment_id
        string method
        real amount
        string currency
        string status
        string utr_number
        datetime created_at
    }

    NOTIFICATIONS_LOG {
        string id PK
        string payment_id FK
        string channel
        string recipient
        string status
        string external_id
        datetime sent_at
    }

    RECIPIENTS {
        string id PK
        string name
        string email
        string phone
        datetime created_at
    }
```

---

## 🛡️ Security Architecture

1. **Non-Root Execution**:
   - The Node.js application container runs under the dedicated `node` user (UID 1000), preventing container breakout exploits.
2. **Reverse Proxy Shield**:
   - Nginx handles all public traffic on port 80 and 443. The Node.js application is never directly exposed to the internet.
3. **Hardened HTTP Headers**:
   - `Content-Security-Policy (CSP)` tuned for Razorpay and Google Fonts.
   - `X-Frame-Options: SAMEORIGIN` prevents clickjacking.
   - `X-Content-Type-Options: nosniff` stops MIME-type sniffing.
   - `HSTS (HTTP Strict Transport Security)` enforces TLS across subdomains.
4. **Cryptographic Verification**:
   - Razorpay signatures are verified using server-side HMAC-SHA256 digests (`crypto.createHmac('sha256', secret)`).
   - Secret tokens are stored strictly in environment variables and never logged.
5. **UFW & Fail2Ban**:
   - Host firewall drops all unapproved incoming ports. Only 22, 80, and 443 are allowed.

---

## 📈 Scalability Roadmap (From Free Tier to Millions)

| Stage | Infrastructure Tier | Target Scale | Architecture Changes |
| :--- | :--- | :--- | :--- |
| **Phase 1 (Current)** | AWS Free Tier (`t2.micro` / `t3.micro`) | 1 – 10,000 req/day | In-container Nginx, SQLite in WAL mode, direct SMTP/Twilio calls. Costs: **$0.00/mo**. |
| **Phase 2** | AWS `t4g.small` + Amazon RDS PostgreSQL | 10k – 100k req/day | Migrate SQLite to managed PostgreSQL (RDS Free Tier), implement Redis for BullMQ asynchronous notification queuing. |
| **Phase 3** | AWS ECS Fargate + CloudFront CDN + S3 | 100k – 1M+ req/day | Decouple frontend to S3/CloudFront; run stateless backend containers on ECS Fargate with Auto-Scaling; AWS SES for high-volume email. |
| **Phase 4** | Multi-Region Active-Active | Enterprise Global | Global Accelerator, Multi-AZ Aurora PostgreSQL, Kafka event bus for notifications. |
