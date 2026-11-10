const express = require('express');
const router = express.Router();
const recipientController = require('../controllers/recipient.controller');

// List configured recipients
router.get('/', (req, res, next) => recipientController.getRecipients(req, res, next));

// Batch update/save recipients
router.post('/', (req, res, next) => recipientController.saveRecipients(req, res, next));

// Update recipient details
router.put('/:id', (req, res, next) => recipientController.updateRecipient(req, res, next));

module.exports = router;
