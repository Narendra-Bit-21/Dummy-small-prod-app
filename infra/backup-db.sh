#!/usr/bin/env bash
# ==============================================================================
# QuickPay & Notify Studio - Automated SQLite Database Backup Script
# Performs safe online SQLite backup (non-locking via PRAGMA or sqlite3 .backup),
# compresses with gzip, and purges backups older than 7 days.
# Usage: Add to crontab: 0 2 * * * /home/ubuntu/Dummy-small-prod-app/infra/backup-db.sh
# ==============================================================================

set -euo pipefail

APP_DIR="${1:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
DB_PATH="${APP_DIR}/database/payments.db"
BACKUP_DIR="${APP_DIR}/database/backups"
TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
TARGET_BACKUP="${BACKUP_DIR}/payments_backup_${TIMESTAMP}.sqlite"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
    echo "[ERROR] Database file not found at ${DB_PATH}" >&2
    exit 1
fi

echo "[INFO] Starting safe online backup of ${DB_PATH}..."

# Use sqlite3 .backup command to ensure atomic transaction-safe snapshot
if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '${TARGET_BACKUP}'"
else
    # Fallback: Safe file copy
    cp "$DB_PATH" "$TARGET_BACKUP"
fi

# Compress the snapshot
gzip -f "$TARGET_BACKUP"
BACKUP_ARCHIVE="${TARGET_BACKUP}.gz"

echo "[SUCCESS] Backup created successfully: ${BACKUP_ARCHIVE} ($(du -h "$BACKUP_ARCHIVE" | cut -f1))"

# Prune snapshots older than retention period
echo "[INFO] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "payments_backup_*.sqlite.gz" -type f -mtime "+${RETENTION_DAYS}" -exec rm -f {} +

echo "[SUCCESS] Backup routine completed."
