# 🚀 AWS Free Tier Production Deployment Guide

A step-by-step walkthrough to host **QuickPay & Notify Studio** 100% free for 12 months using the **AWS Free Tier**.

---

## 📋 Table of Contents
1. [Free Tier Overview & Eligibility](#1-free-tier-overview--eligibility)
2. [Step 1: Launch an EC2 Instance (t2.micro / t3.micro)](#step-1-launch-an-ec2-instance)
3. [Step 2: Security Group Configuration](#step-2-security-group-configuration)
4. [Step 3: Connect to your EC2 Instance](#step-3-connect-to-your-ec2-instance)
5. [Step 4: Run the One-Click Automated Deployment Script](#step-4-run-the-one-click-automated-deployment-script)
6. [Step 5: Setup Free Custom Domain (DuckDNS / No-IP / Cloudflare)](#step-5-setup-free-custom-domain)
7. [Step 6: Free SSL Certificate Setup (Let's Encrypt)](#step-6-free-ssl-certificate-setup)
8. [Step 7: Keep Your Deployment 100% Free Forever (Cost Guardrails)](#step-7-keep-your-deployment-100-free-forever)
9. [Operations, Monitoring & Database Backups](#operations-monitoring--database-backups)

---

## 1. Free Tier Overview & Eligibility

AWS offers a generous **12-Month Free Tier** for new accounts. To run this production stack without spending a single cent, we leverage:

| AWS Resource | Free Tier Monthly Allowance | Our Architecture Usage | Cost |
| :--- | :--- | :--- | :--- |
| **EC2 Virtual Machine** | 750 hours/month of `t2.micro` (or `t3.micro` in eligible regions) | 1 instance running 24/7 (720–744 hrs/mo) | **$0.00** |
| **EBS Storage** | 30 GB of General Purpose SSD (`gp3` or `gp2`) | 20 GB allocated to instance OS & SQLite volume | **$0.00** |
| **Egress Bandwidth** | 100 GB/month data transfer out to the internet | ~2 to 5 GB/month expected traffic | **$0.00** |
| **Let's Encrypt SSL** | Unlimited free SSL/TLS certificates via ACME | In-container Certbot automation | **$0.00** |

> [!IMPORTANT]
> **Do NOT provision an AWS Application Load Balancer (ALB) or NAT Gateway.** AWS ALBs cost ~$16–$22/month. Our stack uses an in-container **Nginx reverse proxy** directly on port 80/443, giving you enterprise-grade proxying, HTTP/2, gzip compression, and SSL termination at **$0.00**.

---

## Step 1: Launch an EC2 Instance

1. Log in to the [AWS Management Console](https://console.aws.amazon.com/console/home).
2. In the top navigation bar, select your preferred AWS Region closest to your users:
   - **India**: `ap-south-1` (Mumbai)
   - **US East**: `us-east-1` (N. Virginia)
   - **Europe**: `eu-west-1` (Ireland)
3. In the search box at the top, type **EC2** and select **EC2 Dashboard**.
4. Click the orange **"Launch Instance"** button.

### Configure Instance Settings:
1. **Name and tags**:
   - Name: `quickpay-production-server`
2. **Application and OS Images (Amazon Machine Image)**:
   - Select **Ubuntu**.
   - Choose: **Ubuntu Server 24.04 LTS (HVM), SSD Volume Type (64-bit (x86))** (marked *"Free tier eligible"*).
3. **Instance Type**:
   - Select **`t2.micro`** (1 vCPU, 1 GiB Memory, Free tier eligible).
   - *(Note: In regions where `t2.micro` is unavailable, choose `t3.micro`)*.
4. **Key Pair (login)**:
   - Click **"Create new key pair"**.
   - Key pair name: `quickpay-ec2-key`
   - Key pair type: **RSA**
   - Private key file format: **`.pem`** (for OpenSSH / macOS / Linux / Windows PowerShell) or **`.ppk`** (for PuTTY).
   - Click **Create key pair** and save the downloaded `.pem` file to a secure directory (e.g., `~/.ssh/` or `C:\Users\<YourUser>\.ssh\`).

---

## Step 2: Security Group Configuration

Under the **Network settings** panel on the Launch Instance screen:
1. Select **"Create security group"**.
2. Security group name: `quickpay-web-sg`.
3. Description: `Allow SSH, HTTP, and HTTPS inbound traffic`.
4. Ensure **"Auto-assign public IP"** is set to **Enable**.
5. Add the following **Inbound Security Group Rules**:

| Type | Protocol | Port Range | Source Type | Source IP / CIDR | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | My IP *(or Anywhere)* | `0.0.0.0/0` | Secure terminal access |
| **HTTP** | TCP | `80` | Anywhere | `0.0.0.0/0` | Web traffic & ACME challenge |
| **HTTPS** | TCP | `443` | Anywhere | `0.0.0.0/0` | Encrypted SSL web traffic |

> [!TIP]
> For maximum security, restrict Port 22 (SSH) to **"My IP"**. If your home ISP changes your IP dynamically, you can leave it at `0.0.0.0/0` because SSH is protected by your cryptographic private key.

### Configure Storage:
1. Under **Configure storage**:
   - Set the size to **`20 GiB`** or **`30 GiB`** (Free tier allows up to 30 GiB).
   - Volume Type: **`gp3`** (General Purpose SSD).

2. Click the orange **"Launch Instance"** button at the bottom right.
3. Wait 1–2 minutes until the instance state changes to **"Running"** and Status Check shows **"2/2 checks passed"**.
4. Note your instance's **Public IPv4 address** (e.g., `13.233.104.55`).

---

## Step 3: Connect to your EC2 Instance

### Option A: Using Local Terminal / PowerShell (Recommended)
1. Open terminal on your computer and navigate to the directory where your `.pem` key was downloaded:
   ```bash
   # On macOS / Linux (set strict read permissions):
   chmod 400 ~/.ssh/quickpay-ec2-key.pem

   # Connect via SSH:
   ssh -i ~/.ssh/quickpay-ec2-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
   ```

2. On **Windows PowerShell**:
   ```powershell
   ssh -i C:\path\to\quickpay-ec2-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
   ```

### Option B: AWS EC2 Instance Connect (No SSH Keys Needed)
1. In the EC2 Console, select your instance checkbox.
2. Click the **"Connect"** button at the top.
3. Choose the **"EC2 Instance Connect"** tab.
4. User name: `ubuntu`.
5. Click **"Connect"**. A browser-based terminal opens immediately!

---

## Step 4: Run the One-Click Automated Deployment Script

Once inside your EC2 terminal, run the following automated commands:

```bash
# 1. Clone your project repository
git clone https://github.com/<your-github-username>/Dummy-small-prod-app.git app
cd app

# 2. Make the setup script executable and run it with sudo
chmod +x deploy/aws-ec2-setup.sh
sudo bash deploy/aws-ec2-setup.sh
```

### What `deploy/aws-ec2-setup.sh` Automatically Does:
1. **Configures 2GB Swap Memory**:
   - `t2.micro` instances have 1 GB RAM. Compiling native modules or launching Docker can cause Out-Of-Memory (OOM) kills. The script automatically creates and activates a **2GB swapfile** on EBS storage to ensure 100% stability.
2. **Installs Docker & Docker Compose v2**:
   - Configures official Docker apt repositories and installs the latest engine.
3. **Hardens Host Firewall (UFW)**:
   - Configures default deny incoming, opens ports 22, 80, and 443.
4. **Bootstraps SSL Placeholders**:
   - Creates a temporary self-signed certificate so Nginx starts on Port 443 without errors.
5. **Registers Systemd Service (`quickpay.service`)**:
   - Configures systemd so that if your EC2 instance is rebooted or patched, Docker Compose automatically starts on boot.
6. **Launches the App & Nginx**:
   - Builds the production image and starts the containers with persistent SQLite storage.

Verify the application is live by opening:
```
http://<YOUR-EC2-PUBLIC-IP>/
```

---

## Step 5: Setup Free Custom Domain

To enable HTTPS with Let's Encrypt, you need a domain name pointing to your EC2 Public IP. You can use any of the following free options:

### Free Option 1: DuckDNS (Fastest & 100% Free)
1. Visit [DuckDNS.org](https://www.duckdns.org/) and sign in with GitHub or Google.
2. Under **domains**, type a subdomain name (e.g., `quickpay-demo`).
3. In the **current ip** box, enter your EC2 **Public IPv4 address**.
4. Click **"update ip"**.
5. Your domain is now: `quickpay-demo.duckdns.org`!

### Free Option 2: Cloudflare + Custom Domain
1. If you own a domain (e.g. from Namecheap, GoDaddy, Hostinger):
2. Add your domain to Cloudflare's Free Plan.
3. In Cloudflare DNS settings, add an **`A` Record**:
   - Name: `@` (or `pay`)
   - IPv4 Address: `<YOUR-EC2-PUBLIC-IP>`
   - Proxy status: **DNS Only** (Grey Cloud) during initial Let's Encrypt certificate issuance.

---

## Step 6: Free SSL Certificate Setup

Now that your domain points to your EC2 instance, execute the included SSL initialization script:

```bash
# Navigate to application root
cd /home/ubuntu/app

# Run the Let's Encrypt initialization script
sudo bash infra/init-letsencrypt.sh <your-domain.com> <your-email@gmail.com>

# Example:
# sudo bash infra/init-letsencrypt.sh quickpay-demo.duckdns.org ravi123sehravat@gmail.com
```

### What Happens:
- Certbot requests a 4096-bit RSA certificate from Let's Encrypt using the HTTP-01 webroot challenge.
- The dummy certificate is replaced with your verified SSL certificate.
- Nginx is reloaded with HTTP/2 and modern TLS 1.2/1.3 ciphers.
- The included `certbot` container runs in the background and automatically renews your certificate every 12 hours before it expires!

Visit your secure site:
```
https://<your-domain.com>/
```

---

## Step 7: Keep Your Deployment 100% Free Forever

Follow these 5 ironclad rules to guarantee your AWS bill remains **$0.00**:

### 1. Avoid Elastic IP Idle Charges
- In 2024, AWS introduced a charge of $0.005/hour for unused public IPv4 addresses.
- **Rule**: Use the auto-assigned EC2 public IPv4 address. If you allocate an **Elastic IP**, ensure it is attached to a running instance at all times, or release it when not in use.

### 2. Keep EBS Storage Under 30 GB
- AWS Free Tier provides **30 GB of EBS gp3/gp2** storage per month.
- Our setup uses a single 20 GB root volume. Do not attach additional volumes.

### 3. Run Only ONE Instance 24/7
- The free tier grants **750 instance hours per month**.
- 1 instance running for 31 days = 744 hours (within 750 hours).
- If you run 2 instances simultaneously, you consume 1,488 hours and will be billed for the excess 738 hours. Always stop or terminate unused test instances.

### 4. Setup Zero-Dollar AWS Billing Alert
1. In the AWS Console, search for **Billing and Cost Management**.
2. Go to **Budgets** -> **Create budget**.
3. Choose **Zero spend budget** template.
4. Set recipient email to your email (e.g., `ravi123sehravat@gmail.com`).
5. AWS will immediately email you if any charge exceeds $0.01!

### 5. Never Provision AWS Managed Load Balancers (ALB/ELB) or NAT Gateways
- AWS Application Load Balancers cost ~$16/month.
- Our containerized **Nginx reverse proxy** fulfills all load balancing, SSL termination, and caching tasks for free on the EC2 instance.

---

## Operations, Monitoring & Database Backups

### 1. View Live Application Logs
```bash
# View backend and Nginx logs together:
docker compose -f deploy/docker-compose.yml logs -f

# View only backend application logs:
docker compose -f deploy/docker-compose.yml logs -f app
```

### 2. Run Built-In Health Diagnostics
```bash
bash deploy/healthcheck.sh
```
This tests container states, HTTP 200 health probes, SQLite database consistency, memory availability, and disk usage.

### 3. Automated SQLite Daily Backups
The database is located at `./database/payments.db`. To enable automated safe backups with 7-day retention:

```bash
# Test manual backup:
bash infra/backup-db.sh

# Schedule daily backup at 02:00 AM UTC in crontab:
(crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash /home/ubuntu/app/infra/backup-db.sh >> /home/ubuntu/app/logs/backup.log 2>&1") | crontab -
```

### 4. Updating Application Code (Zero-Downtime Pull)
When you push new code to GitHub:
```bash
cd /home/ubuntu/app
git pull origin main
docker compose -f deploy/docker-compose.yml build app
docker compose -f deploy/docker-compose.yml up -d --no-deps app
```
Nginx continues routing requests without breaking connections.
