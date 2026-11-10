#!/usr/bin/env bash
# ==============================================================================
# QuickPay & Notify Studio - Production Healthcheck & Diagnostics Script
# Checks Backend API, Nginx Reverse Proxy, Docker containers, SQLite DB,
# EBS Disk space, and Memory / Swap allocation.
# Exits with 0 on healthy, 1 on critical issue.
# ==============================================================================

set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "  [${GREEN} PASS ${NC}] $1"; }
warn() { echo -e "  [${YELLOW} WARN ${NC}] $1"; ((WARNINGS++)); }
fail() { echo -e "  [${RED} FAIL ${NC}] $1"; ((ERRORS++)); }

echo -e "\n${BOLD}${CYAN}=== QuickPay & Notify Studio System Health Diagnostics ===${NC}"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# 1. Check Docker Daemon
echo -e "\n${BOLD}1. Docker Engine Status:${NC}"
if command -v docker &>/dev/null && docker info &>/dev/null; then
    pass "Docker Engine is active and responding."
    
    # Check running containers
    APP_STATUS=$(docker inspect --format='{{.State.Status}} (Health: {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}})' quickpay-app-backend 2>/dev/null || echo "not found")
    NGINX_STATUS=$(docker inspect --format='{{.State.Status}}' quickpay-app-nginx 2>/dev/null || echo "not found")

    if [[ "$APP_STATUS" == *"running"* ]]; then
        pass "Backend Container: ${APP_STATUS}"
    else
        fail "Backend Container: ${APP_STATUS}"
    fi

    if [[ "$NGINX_STATUS" == "running" ]]; then
        pass "Nginx Proxy Container: ${NGINX_STATUS}"
    else
        fail "Nginx Proxy Container: ${NGINX_STATUS}"
    fi
else
    fail "Docker daemon is not running or current user lacks permissions."
fi

# 2. HTTP Endpoints Check
echo -e "\n${BOLD}2. HTTP Health Probe (/api/health):${NC}"
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --connect-timeout 5 http://127.0.0.1/api/health 2>/dev/null || echo -e "error\n000")
HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" == "200" ]]; then
    pass "API Health Endpoint returned 200 OK."
    # Extract status field from JSON if jq is available
    if command -v jq &>/dev/null; then
        STATUS_VALUE=$(echo "$HTTP_BODY" | jq -r '.status // .success // empty' 2>/dev/null || echo "ok")
        pass "Payload status: ${STATUS_VALUE:-valid json}"
    fi
else
    fail "API Health Probe failed (HTTP Code: ${HTTP_CODE}). Body: ${HTTP_BODY}"
fi

# 3. SQLite Database Verification
echo -e "\n${BOLD}3. SQLite Database File Integrity:${NC}"
DB_FILE="./database/payments.db"
if [[ ! -f "$DB_FILE" && -f "../database/payments.db" ]]; then
    DB_FILE="../database/payments.db"
fi

if [[ -f "$DB_FILE" ]]; then
    DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
    pass "Database file exists at '${DB_FILE}' (Size: ${DB_SIZE})."
    
    if command -v sqlite3 &>/dev/null; then
        INTEGRITY_CHECK=$(sqlite3 "$DB_FILE" "PRAGMA quick_check;" 2>&1 || echo "error")
        if [[ "$INTEGRITY_CHECK" == "ok" ]]; then
            pass "SQLite PRAGMA quick_check passed: ok."
        else
            warn "SQLite integrity check warning: ${INTEGRITY_CHECK}"
        fi
    fi
else
    warn "Database file not found at '${DB_FILE}' (may be initialized on first request)."
fi

# 4. Host Memory & Swap Status
echo -e "\n${BOLD}4. System Memory & Swap Allocation:${NC}"
if command -v free &>/dev/null; then
    MEM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
    MEM_AVAIL=$(free -m | awk '/Mem:/ {print $7}')
    SWAP_TOTAL=$(free -m | awk '/Swap:/ {print $2}')
    SWAP_USED=$(free -m | awk '/Swap:/ {print $3}')

    pass "RAM Available: ${MEM_AVAIL}MB / ${MEM_TOTAL}MB"
    if [[ "$SWAP_TOTAL" -gt 0 ]]; then
        pass "Swap Allocated: ${SWAP_TOTAL}MB (Used: ${SWAP_USED}MB)"
    else
        warn "No swap memory detected! Recommended 2GB swap on t2.micro / t3.micro."
    fi
fi

# 5. Disk Space Verification (EBS Volume)
echo -e "\n${BOLD}5. EBS Disk Space Usage:${NC}"
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')

if [[ "$DISK_USAGE" -lt 80 ]]; then
    pass "Root filesystem has ample space: ${DISK_USAGE}% used (${DISK_AVAIL} free)."
elif [[ "$DISK_USAGE" -lt 90 ]]; then
    warn "Root filesystem is getting full: ${DISK_USAGE}% used (${DISK_AVAIL} free)."
else
    fail "Root filesystem critical! ${DISK_USAGE}% used (${DISK_AVAIL} free)."
fi

# Summary
echo -e "\n======================================================="
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}ALL SYSTEMS HEALTHY (0 errors, 0 warnings)${NC}\n"
    exit 0
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}${BOLD}SYSTEM OPERATIONAL WITH WARNINGS (0 errors, ${WARNINGS} warnings)${NC}\n"
    exit 0
else
    echo -e "${RED}${BOLD}SYSTEM UNHEALTHY (${ERRORS} errors, ${WARNINGS} warnings)${NC}\n"
    exit 1
fi
