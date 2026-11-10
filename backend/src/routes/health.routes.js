const express = require('express');
const router = express.Router();

// Public liveness probe. Intentionally minimal: no DB paths, key prefixes,
// sender addresses or service configuration are exposed here.
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

module.exports = router;
