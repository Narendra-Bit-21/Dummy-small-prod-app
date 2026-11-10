const config = require('../config/env');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[Error] ${req.method} ${req.url} - ${statusCode}: ${message}`);
  if (config.nodeEnv === 'development' && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(config.nodeEnv === 'development' && { stack: err.stack })
    }
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: `Cannot ${req.method} ${req.originalUrl} - Route not found`
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
