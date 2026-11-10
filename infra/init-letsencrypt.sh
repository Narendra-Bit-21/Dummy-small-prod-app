#!/usr/bin/env bash
# ==============================================================================
# QuickPay & Notify Studio - Let's Encrypt SSL Bootstrap Script
# Solves the bootstrap chicken-and-egg problem:
# 1. Creates a dummy self-signed certificate so Nginx starts.
# 2. Starts Nginx to handle ACME challenge over port 80.
# 3. Requests official Let's Encrypt production certificates.
# 4. Replaces dummy certs and hot-reloads Nginx.
# Usage: sudo bash infra/init-letsencrypt.sh <domain.com> <your-email@example.com>
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
STAGING=0 # Set to 1 if testing to avoid Let's Encrypt rate limits

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "Usage: sudo bash $0 <domain-name> <notification-email>"
    echo "Example: sudo bash $0 pay.example.com admin@example.com"
    exit 1
fi

DATA_PATH="./certbot"
RSA_KEY_SIZE=4096

echo "======================================================================"
echo "Initializing Let's Encrypt SSL Certificate Setup for: ${DOMAIN}"
echo "======================================================================"

# Ensure directories exist
mkdir -p "${DATA_PATH}/conf/live/${DOMAIN}"
mkdir -p "${DATA_PATH}/www"

# Check if certificates already exist
if [ -e "${DATA_PATH}/conf/live/${DOMAIN}/cert.pem" ]; then
    read -p "Existing data found for ${DOMAIN}. Continue and replace existing certificate? (y/N) " decision
    if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
        exit 0
    fi
fi

# Step 1: Create dummy certificate
echo "[1/4] Creating bootstrap self-signed certificate for ${DOMAIN}..."
openssl req -x509 -nodes -newkey rsa:${RSA_KEY_SIZE} -days 1 \
    -keyout "${DATA_PATH}/conf/live/${DOMAIN}/privkey.pem" \
    -out "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" \
    -subj "/CN=localhost" > /dev/null 2>&1

# Link root live directory for nginx default mount
cp -f "${DATA_PATH}/conf/live/${DOMAIN}/privkey.pem" "${DATA_PATH}/conf/live/privkey.pem"
cp -f "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" "${DATA_PATH}/conf/live/fullchain.pem"

# Step 2: Start Nginx
echo "[2/4] Starting Nginx reverse proxy..."
docker compose -f deploy/docker-compose.yml up --force-recreate -d nginx

# Step 3: Request Let's Encrypt Certificate
echo "[3/4] Requesting Let's Encrypt SSL certificate via ACME Webroot..."

# Enable staging if requested
STAGING_ARG=""
if [ $STAGING != "0" ]; then
    STAGING_ARG="--staging"
fi

docker compose -f deploy/docker-compose.yml run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot

# Copy active certs to default mount
cp -f "${DATA_PATH}/conf/live/${DOMAIN}/privkey.pem" "${DATA_PATH}/conf/live/privkey.pem"
cp -f "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" "${DATA_PATH}/conf/live/fullchain.pem"

# Step 4: Reload Nginx with new production certificate
echo "[4/4] Reloading Nginx with new official SSL certificates..."
docker compose -f deploy/docker-compose.yml exec nginx nginx -s reload

echo ""
echo "======================================================================"
echo "SSL SETUP COMPLETE! HTTPS is now active at: https://${DOMAIN}/"
echo "Automatic renewal is handled by the certbot daemon container every 12h."
echo "======================================================================"
