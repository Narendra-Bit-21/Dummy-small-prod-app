#!/usr/bin/env bash
# ==============================================================================
# QuickPay & Notify Studio - Automated AWS EC2 Setup Script
# Target OS: Ubuntu 22.04 / 24.04 LTS (x86_64) on t2.micro / t3.micro
# Purpose: One-click production setup installing Docker, UFW firewall,
#          2GB RAM Swapfile (prevents OOM on 1GB instances), Certbot,
#          systemd service, and launching the full application stack.
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Terminal Colors & Styling
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}${BOLD}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"; }
error()   { echo -e "${RED}${BOLD}[ERROR]${NC} $1"; exit 1; }

# ------------------------------------------------------------------------------
# 1. Privileges & Pre-flight Checks
# ------------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
   error "This script must be run with root or sudo privileges: sudo bash $0"
fi

echo -e "${BLUE}${BOLD}"
cat << "EOF"
======================================================================
  ____            _      _      ____                  
 / __ \ __  _(_) ____| | __ |  _ \  __ _  _   _ 
/ / _` | | | | |/ ___| |/ / | |_) |/ _` || | | |
| | (_| | |_| | | (__|   <  |  __/| (_| || |_| |
 \ \__,_|\__,_|_|\___|_|\_\ |_|    \__,_| \__, |
  \____/                                  |___/ 
      AWS Free Tier Production Setup & Auto-Deployer
======================================================================
EOF
echo -e "${NC}"

TARGET_USER="${SUDO_USER:-ubuntu}"
APP_DIR="${PWD}"

# If script is run directly from inside deploy/, step back to project root
if [[ "$(basename "$APP_DIR")" == "deploy" ]]; then
    cd ..
    APP_DIR="${PWD}"
fi

info "Deploying application in: ${APP_DIR}"
info "Operating system detected: $(lsb_release -d 2>/dev/null | cut -f2 || uname -s)"
info "Configuring for host user: ${TARGET_USER}"

# ------------------------------------------------------------------------------
# 2. Configure 2GB Swap Memory (Prevents OOM on 1GB RAM t2/t3.micro)
# ------------------------------------------------------------------------------
info "Checking virtual memory / swap configuration..."
if [[ $(swapon --show | wc -l) -le 1 ]]; then
    info "No active swap found. Allocating 2GB swap space on EBS to prevent Out-Of-Memory crashes..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    
    # Persist across reboots
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    
    # Optimize swappiness for low-RAM server
    sysctl vm.swappiness=20
    sysctl vm.vfs_cache_pressure=50
    echo 'vm.swappiness=20' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    success "2GB Swap successfully configured and activated."
else
    success "Swap space is already active: $(free -h | awk '/Swap:/ {print $2}')"
fi

# ------------------------------------------------------------------------------
# 3. System Packages & Prerequisites
# ------------------------------------------------------------------------------
info "Updating apt package repository and system packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

info "Installing base utilities (curl, git, ufw, jq, certbot, sqlite3)..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw \
    jq \
    sqlite3 \
    certbot \
    htop \
    fail2ban

# ------------------------------------------------------------------------------
# 4. Install Official Docker Engine & Docker Compose v2
# ------------------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    info "Installing Docker Engine from official Docker repository..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    systemctl enable docker
    systemctl start docker
    success "Docker $(docker --version) installed successfully."
else
    success "Docker is already installed: $(docker --version)"
fi

# Add target user to docker group
if id "$TARGET_USER" &>/dev/null; then
    usermod -aG docker "$TARGET_USER" || true
    info "Added user '${TARGET_USER}' to the 'docker' group."
fi

# ------------------------------------------------------------------------------
# 5. UFW Firewall Configuration
# ------------------------------------------------------------------------------
info "Configuring Uncomplicated Firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Web'
ufw allow 443/tcp comment 'HTTPS Secure Web'

# Enable UFW non-interactively
echo "y" | ufw enable
success "UFW firewall active: Ports 22, 80, 443 allowed."

# ------------------------------------------------------------------------------
# 6. Application Directories & Self-Signed SSL Placeholder
# ------------------------------------------------------------------------------
info "Ensuring directory structures and volume paths..."
mkdir -p "${APP_DIR}/database"
mkdir -p "${APP_DIR}/logs"
mkdir -p "${APP_DIR}/certbot/conf/live"
mkdir -p "${APP_DIR}/certbot/www"

# Create dummy self-signed SSL certificate if real certs do not yet exist
# This allows Nginx to start up on port 443 immediately without crashing!
SSL_CERT_PATH="${APP_DIR}/certbot/conf/live/fullchain.pem"
SSL_KEY_PATH="${APP_DIR}/certbot/conf/live/privkey.pem"

if [[ ! -f "$SSL_CERT_PATH" || ! -f "$SSL_KEY_PATH" ]]; then
    info "Generating initial bootstrap self-signed SSL certificate..."
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
        -keyout "$SSL_KEY_PATH" \
        -out "$SSL_CERT_PATH" \
        -subj "/CN=localhost/O=QuickPayBootstrap/C=IN" > /dev/null 2>&1
    success "Bootstrap SSL certificates created for initial Nginx launch."
fi

# Grant correct ownership to node user (UID 1000) for database
chown -R 1000:1000 "${APP_DIR}/database"
chmod 775 "${APP_DIR}/database"

# ------------------------------------------------------------------------------
# 7. Environment Variables Configuration (.env)
# ------------------------------------------------------------------------------
ENV_FILE="${APP_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    info "No .env file found. Generating default production .env..."
    if [[ -f "${APP_DIR}/.env.example" ]]; then
        cp "${APP_DIR}/.env.example" "$ENV_FILE"
    else
        cat << 'EOF' > "$ENV_FILE"
# QuickPay & Notify Studio - Production Environment Variables
NODE_ENV=production
PORT=5000
APP_NAME="QuickPay & Notify Studio"
APP_URL=http://localhost

# Razorpay Credentials (Test keys allow instant testing with ₹1)
RAZORPAY_KEY_ID=rzp_test_51MockKeyId99
RAZORPAY_KEY_SECRET=mock_secret_replace_in_prod
RAZORPAY_WEBHOOK_SECRET=quickpay_webhook_secret_key_123

# Direct UPI Fallback (Instant settlement to user's bank account)
UPI_VPA=ravi123sehravat@okhdfcbank
UPI_PAYEE_NAME=Ravi Sehrawat

# Gmail SMTP Email Notifications
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=ravi123sehravat@gmail.com
EMAIL_PASS=your_16_char_google_app_password
EMAIL_FROM="QuickPay Studio" <ravi123sehravat@gmail.com>

# Twilio WhatsApp & SMS Notifications
TWILIO_ACCOUNT_SID=AC_mock_twilio_account_sid_replace
TWILIO_AUTH_TOKEN=mock_twilio_auth_token_replace
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+12015550123

# SQLite Database
DB_PATH=/app/database/payments.db
EOF
    fi
    chown "$TARGET_USER":"$TARGET_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    warn "Created ${ENV_FILE}. Please edit it to include your live Razorpay, Gmail, and Twilio credentials."
else
    success "Existing .env configuration detected."
fi

# ------------------------------------------------------------------------------
# 8. Systemd Service Registration (Auto-start on EC2 Reboot)
# ------------------------------------------------------------------------------
info "Configuring systemd service 'quickpay.service' for automatic reboot resilience..."
cat << EOF > /etc/systemd/system/quickpay.service
[Unit]
Description=QuickPay and Notify Studio Application Stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/docker compose -f ${APP_DIR}/deploy/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f ${APP_DIR}/deploy/docker-compose.yml down
ExecReload=/usr/bin/docker compose -f ${APP_DIR}/deploy/docker-compose.yml restart
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable quickpay.service
success "Systemd service 'quickpay.service' enabled."

# ------------------------------------------------------------------------------
# 9. Build and Start Application Containers
# ------------------------------------------------------------------------------
info "Building and launching Docker Compose stack..."
cd "${APP_DIR}"
docker compose -f deploy/docker-compose.yml down --remove-orphans || true
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d

# ------------------------------------------------------------------------------
# 10. Healthcheck & Public IP Discovery
# ------------------------------------------------------------------------------
info "Waiting for backend service to become healthy (up to 30s)..."
RETRIES=10
BACKEND_HEALTHY=false

for i in $(seq 1 $RETRIES); do
    sleep 3
    if curl -s -f "http://127.0.0.1/api/health" > /dev/null 2>&1; then
        BACKEND_HEALTHY=true
        break
    fi
    info "Waiting for service startup... attempt $i/$RETRIES"
done

PUBLIC_IP=$(curl -s -m 5 https://api.ipify.org || curl -s -m 5 https://icanhazip.com || echo "YOUR-SERVER-IP")

echo ""
echo -e "${GREEN}${BOLD}======================================================================${NC}"
echo -e "${GREEN}${BOLD}  QUICKPAY & NOTIFY STUDIO DEPLOYMENT SUCCESSFUL!                     ${NC}"
echo -e "${GREEN}${BOLD}======================================================================${NC}"
echo ""
if [[ "$BACKEND_HEALTHY" == "true" ]]; then
    echo -e "Status:     ${GREEN}${BOLD}ONLINE & HEALTHY${NC}"
else
    echo -e "Status:     ${YELLOW}${BOLD}CONTAINERS STARTED (Health probe still stabilizing)${NC}"
fi

echo -e "Public URL: ${CYAN}${BOLD}http://${PUBLIC_IP}/${NC}"
echo -e "Health API: ${CYAN}http://${PUBLIC_IP}/api/health${NC}"
echo ""
echo -e "${BOLD}Helpful Management Commands:${NC}"
echo -e "  - View live logs:     ${CYAN}docker compose -f ${APP_DIR}/deploy/docker-compose.yml logs -f${NC}"
echo -e "  - Restart stack:      ${CYAN}sudo systemctl restart quickpay.service${NC}"
echo -e "  - Inspect database:   ${CYAN}sqlite3 ${APP_DIR}/database/payments.db '.tables'${NC}"
echo -e "  - Run healthcheck:    ${CYAN}bash ${APP_DIR}/deploy/healthcheck.sh${NC}"
echo -e "  - Configure SSL Cert: ${CYAN}bash ${APP_DIR}/infra/init-letsencrypt.sh yourdomain.com${NC}"
echo ""
echo -e "${YELLOW}Next Step: Edit '${APP_DIR}/.env' with your real credentials and run:${NC}"
echo -e "  docker compose -f ${APP_DIR}/deploy/docker-compose.yml restart app"
echo ""
