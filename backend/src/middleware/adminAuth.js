const config = require('../config/env');

module.exports = function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!config.adminToken || token === config.adminToken) return next();
  return res.status(401).json({ success: false, message: 'Admin token required.' });
};
