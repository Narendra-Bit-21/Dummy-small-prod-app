const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');

// Dispatch multi-channel notifications (email, whatsapp, sms)
router.post('/send', (req, res, next) => notificationController.sendNotifications(req, res, next));
router.post('/dispatch', (req, res, next) => notificationController.sendNotifications(req, res, next));
router.post('/dispatch-stream', (req, res, next) => notificationController.streamNotifications(req, res, next));

// Notification audit history
router.get('/history', (req, res, next) => notificationController.getHistory(req, res, next));

module.exports = router;
