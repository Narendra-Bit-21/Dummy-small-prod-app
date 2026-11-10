# ⚡ QuickPay & Notify Studio

[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Nginx](https://img.shields.io/badge/Nginx-1.27_Alpine-009639?style=flat&logo=nginx&logoColor=white)](https://nginx.org/)
[![AWS Free Tier](https://img.shields.io/badge/AWS-Free_Tier_Eligible-FF9900?style=flat&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/free/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=flat&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

> **A production-ready micro-monolith for instant ₹1.00 payments (Razorpay + Direct NPCI UPI QR) with real-time multi-channel receipt alerts (Gmail SMTP, Twilio WhatsApp, SMS), automated SQLite persistence, and 100% free hosting on AWS Free Tier.**

---

## ✨ Key Features

- 💳 **Dual Payment Engine**:
  - **Razorpay ₹1.00 Modal**: Full gateway integration supporting UPI, Credit/Debit cards, NetBanking, and Wallets. Test mode works instantly without KYC!
  - **Direct NPCI UPI QR Mode**: Instant settlement directly to your personal bank account (`ravi123sehravat@okaxis`) with **0% merchant transaction fees** and **zero KYC approval**.
- 📬 **Omni-Channel Notification Hub**:
  - **Gmail SMTP (`ravi123sehravat@gmail.com`)**: Responsive, branded HTML email receipts delivered in under 2 seconds.
  - **WhatsApp Real-Time Alerts**: Automated messaging via the Twilio WhatsApp Sandbox (`+1 415 523 8886`).
  - **SMS Confirmations**: Real-time SMS via Twilio or Fast2SMS.
- 💾 **High-Performance SQLite Storage**:
  - Configured with **WAL (Write-Ahead Logging)** mode for high concurrent throughput.
  - Stored on persistent Docker host volume with atomic online backup scripts.
- 🛡️ **Production-Hardened Reverse Proxy**:
  - Nginx 1.27 with gzip compression, strict security headers (CSP, HSTS, X-Frame-Options), and automated Let's Encrypt SSL certificate renewal.
- ☁️ **AWS Free Tier Optimized ($0.00/Month)**:
  - Custom automated setup script (`deploy/aws-ec2-setup.sh`) configured specifically for `t2.micro` / `t3.micro` instances. Includes 2GB swap space allocation to completely eliminate Out-Of-Memory issues on 1GB RAM instances.

---

## 📁 Repository Structure

```
Dummy-small-prod-app/
├── backend/                  # Node.js Express backend application
│   ├── src/
│   │   ├── config/env.js     # Validated environment configuration
│   │   ├── controllers/      # Payment & Notification route handlers
│   │   ├── db/database.js    # SQLite database driver & WAL initializer
│   │   ├── routes/           # Express router endpoints
│   │   └── services/         # Razorpay, Nodemailer, and Twilio integrations
│   ├── package.json          # Backend dependencies
│   ├── server.js             # Main backend application entrypoint
│   └── .env.example          # Backend sample environment variables
├── frontend/                 # Interactive frontend studio
│   └── src/
│       ├── css/styles.css    # Modern responsive CSS styles
│       ├── js/api.js         # Frontend API communication layer
│       ├── js/payment.js     # Razorpay & UPI modal handling
│       ├── js/notifications.js # Real-time alert dispatch UI
│       └── index.html        # Main dashboard interface
├── database/                 # SQLite database storage & schema
│   ├── schema.sql            # Table definitions (payments, notifications, recipients)
│   ├── seeds.sql             # Demo seed data
│   └── app.db                # SQLite database (auto-created on runtime)
├── deploy/                   # Production deployment assets
│   ├── Dockerfile            # Multi-stage Node 20 LTS Alpine Dockerfile
│   ├── docker-compose.yml    # App + Nginx + Certbot container orchestration
│   ├── nginx.conf            # Nginx reverse proxy with gzip & security headers
│   ├── aws-ec2-setup.sh      # 1-Click AWS EC2 setup and installation script
│   └── healthcheck.sh        # Health diagnostics & system monitoring probe
├── infra/                    # Cloud infrastructure utilities
│   ├── dummy-app.service     # Systemd service unit for reboot resilience
│   ├── backup-db.sh          # Atomic SQLite database backup with 7-day rotation
│   ├── init-letsencrypt.sh   # Let's Encrypt SSL bootstrap script
│   └── logrotate.conf        # Automated log rotation to preserve EBS disk space
├── docs/                     # Production engineering guides
│   ├── AWS_FREE_TIER_DEPLOYMENT.md # Complete step-by-step AWS EC2 hosting guide
│   ├── CREDENTIALS_SETUP_GUIDE.md  # How to obtain Razorpay, Gmail, and Twilio keys
│   └── ARCHITECTURE.md       # Architecture diagrams, data flow & scaling roadmap
├── .dockerignore             # Docker build exclusion rules
├── .env.example              # Root environment template
├── docker-compose.yml        # Root convenience Docker Compose wrapper
├── package.json              # Root project scripts
└── README.md                 # Project documentation
```

---

## 🚀 Quickstart Guide

### Option 1: Run Locally with Node.js (Development)

```bash
# 1. Clone repository
git clone https://github.com/<your-username>/Dummy-small-prod-app.git
cd Dummy-small-prod-app

# 2. Copy and customize environment variables
cp .env.example .env

# 3. Install dependencies and start development server
npm install
npm start
```
The server starts at `http://localhost:5000`.

---

### Option 2: Run with Docker Compose (Local or Production)

Run the entire stack (Node.js app + Nginx Reverse Proxy + SQLite persistence) with a single command:

```bash
# Build and start all services in detached mode
docker compose up -d --build

# View real-time container logs
docker compose logs -f

# Check system health
bash deploy/healthcheck.sh
```
Access the application at `http://localhost/`.

---

### Option 3: Deploy to AWS Free Tier in 1 Click

1. Launch a **`t2.micro`** or **`t3.micro`** instance on Ubuntu 24.04 LTS (Security Group: allow Ports **22, 80, 443**).
2. SSH into your EC2 instance and run:

```bash
git clone https://github.com/<your-username>/Dummy-small-prod-app.git app
cd app
sudo bash deploy/aws-ec2-setup.sh
```

The script automatically sets up **2GB Swap space**, installs **Docker & Compose**, configures the **UFW firewall**, sets up **Systemd reboot auto-start**, and launches the production stack.

👉 **Read the complete guide**: [AWS Free Tier Deployment Guide](docs/AWS_FREE_TIER_DEPLOYMENT.md)

---

## ⚙️ Environment Variables Summary

Copy `.env.example` to `.env` and fill in your keys:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Node.js internal listening port | `5000` |
| `NODE_ENV` | Environment mode | `production` |
| `DATABASE_PATH` | Path to persistent SQLite database | `/app/database/app.db` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID (works in Test mode without KYC) | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret | `your_secret` |
| `UPI_VPA` | Personal UPI VPA receiving instant payments | `ravi123sehravat@okaxis` |
| `UPI_PAYEE_NAME` | Payee name shown on UPI apps | `Ravi Sehrawat` |
| `GMAIL_USER` | Gmail address sending email receipts | `ravi123sehravat@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-character Google App Password | `abcd efgh ijkl mnop` |
| `TWILIO_ACCOUNT_SID`| Twilio Account SID for WhatsApp & SMS | `AC...` |
| `TWILIO_AUTH_TOKEN`  | Twilio Auth Secret Token | `your_token` |
| `TWILIO_WHATSAPP_NUMBER`| Twilio WhatsApp Sandbox Number | `whatsapp:+14155238886` |

👉 **Read the step-by-step credentials walkthrough**: [Credentials Setup Guide](docs/CREDENTIALS_SETUP_GUIDE.md)

---

## 🔒 Free Domain & SSL Setup (HTTPS)

Once your domain (e.g. `yourname.duckdns.org` or custom domain) points to your EC2 Public IP:

```bash
# Run the automated SSL bootstrapper
sudo bash infra/init-letsencrypt.sh <yourdomain.com> <your-email@gmail.com>
```

Let's Encrypt validates your domain and reloads Nginx with production TLS 1.2/1.3. The background `certbot` container automatically renews certificates every 12 hours before expiration.

---

## 🩺 System Health Diagnostics & Backups

### Run Automated Healthcheck
```bash
bash deploy/healthcheck.sh
```
Outputs colored diagnostic statuses for Docker containers, HTTP `/api/health`, SQLite integrity, Memory/Swap availability, and EBS disk capacity.

### Safe Online SQLite Backup
```bash
# Create an atomic timestamped .gz backup and rotate snapshots older than 7 days:
bash infra/backup-db.sh
```

---

## 📚 Detailed Documentation

- 📖 [AWS Free Tier Production Deployment Guide](docs/AWS_FREE_TIER_DEPLOYMENT.md)
- 🔑 [Credentials & API Key Integration Guide](docs/CREDENTIALS_SETUP_GUIDE.md)
- 🏗️ [System Architecture, Request Lifecycle & Scaling Roadmap](docs/ARCHITECTURE.md)

---

## 📄 License

This project is licensed under the ISC License.
