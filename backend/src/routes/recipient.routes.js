const express = require('express');
const router = express.Router();
const recipientController = require('../controllers/recipient.controller');
const adminAuth = require('../middleware/adminAuth');

// List configured recipients (public)
router.get('/', (req, res, next) => recipientController.getRecipients(req, res, next));

// Batch update/save recipients (admin only)
router.post('/', adminAuth, (req, res, next) => recipientController.saveRecipients(req, res, next));

// Update recipient details (admin only)
router.put('/:id', adminAuth, (req, res, next) => recipientController.updateRecipient(req, res, next));

module.exports = router;
