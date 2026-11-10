# ==============================================================================
# Production Dockerfile for QuickPay & Notify Studio
# Runtime: Node.js 20 LTS on Alpine Linux
# Hardened, lightweight, non-root user, persistent SQLite volume
# ==============================================================================

FROM node:20-alpine AS base

LABEL maintainer="QuickPay DevOps Team"
LABEL description="Production container for QuickPay & Notify Studio Node.js application"

# Install build tools required for native C++ modules (sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-libs \
    dumb-init

WORKDIR /app

# Ensure directories exist and set ownership
RUN mkdir -p /app/database /app/logs /app/backend /app/frontend && \
    chown -R node:node /app

# Set production environment variables
ENV NODE_ENV=production \
    PORT=5000 \
    DATABASE_PATH=/app/database/app.db \
    DB_PATH=/app/database/app.db

# Copy package manifests
COPY --chown=node:node package*.json ./
COPY --chown=node:node backend/package*.json ./backend/

# Install production dependencies for root and backend
RUN npm install --omit=dev --no-audit --no-fund && \
    cd backend && npm install --omit=dev --no-audit --no-fund && cd .. && \
    apk del python3 make g++ && \
    rm -rf /root/.npm /tmp/*

# Copy application source code
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
COPY --chown=node:node database ./database

# Ensure database directory permissions for user node (UID 1000)
RUN mkdir -p /app/database && \
    chown -R node:node /app/database && \
    chmod 775 /app/database

# Switch to non-root user
USER node

# Expose backend application port
EXPOSE 5000

# Mount persistent volume for SQLite database storage
VOLUME ["/app/database"]

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Launch backend server
CMD ["node", "backend/server.js"]
