const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const config = require('./src/config/env');
const db = require('./src/db/database');
const apiRoutes = require('./src/routes');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

const app = express();

// Security headers (relaxed content security policy to allow QR images and local testing)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Cross-Origin Resource Sharing
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature']
  })
);

// Body Parsers with Raw Body buffer retention for webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    }
  })
);
app.use(express.urlencoded({ extended: true }));

// Request Logger (Development mode)
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Mount Core API Routes
app.use('/api', apiRoutes);

// Optional: Serve frontend static files if available
const frontendDistPaths = [
  path.join(__dirname, '../frontend/dist'),
  path.join(__dirname, '../frontend/build'),
  path.join(__dirname, '../frontend'),
  path.join(__dirname, 'public')
];

let staticServed = false;
for (const distPath of frontendDistPaths) {
  if (fs.existsSync(distPath)) {
    console.log(`[Static] Serving frontend static assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
    staticServed = true;
    break;
  }
}

// Fallback root route if no frontend static assets are present
if (!staticServed) {
  app.get('/', (req, res) => {
    res.json({
      name: 'Notification & Payment Backend API',
      version: '1.0.0',
      status: 'active',
      endpoints: {
        health: '/api/health',
        createOrder: 'POST /api/payment/create-order',
        verifyPayment: 'POST /api/payment/verify',
        generateUpiQr: 'POST /api/payment/generate-upi-qr',
        paymentHistory: 'GET /api/payment/history',
        recipients: 'GET /api/recipients',
        updateRecipient: 'PUT /api/recipients/:id',
        sendNotifications: 'POST /api/notifications/send',
        notificationHistory: 'GET /api/notifications/history'
      }
    });
  });
}

// 404 & Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Server Startup Function
async function startServer() {
  try {
    console.log('[Server] Initializing database layer...');
    await db.init();

    const PORT = config.port;
    const server = app.listen(PORT, () => {
      console.log('\n======================================================');
      console.log(`  🚀 Service running at: http://localhost:${PORT}`);
      console.log(`  🏥 Health Check:       http://localhost:${PORT}/api/health`);
      console.log(`  💳 UPI Dynamic QR:     POST http://localhost:${PORT}/api/payment/generate-upi-qr`);
      console.log(`  💰 Razorpay Order:     POST http://localhost:${PORT}/api/payment/create-order`);
      console.log(`  📢 Batch Notify:       POST http://localhost:${PORT}/api/notifications/send`);
      console.log(`  👥 Recipients:         GET  http://localhost:${PORT}/api/recipients`);
      console.log('======================================================\n');
    });

    // Graceful Shutdown Handlers
    const shutdown = () => {
      console.log('\n[Server] Gracefully shutting down...');
      server.close(() => {
        console.log('[Server] Closed remaining HTTP connections.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(`[Server] Critical failure during startup: ${err.message}`);
    process.exit(1);
  }
}

// Only auto-start when executed directly (allows importing in tests)
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
