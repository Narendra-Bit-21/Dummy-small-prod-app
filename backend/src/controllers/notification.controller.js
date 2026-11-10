const notificationService = require('../services/notification.service');

class NotificationController {
  /**
   * POST /api/notifications/send & POST /api/notifications/dispatch
   * Trigger multi-channel notifications to the recipients
   */
  async sendNotifications(req, res, next) {
    try {
      const {
        batch_id,
        recipients, // optional array override
        channels = ['email', 'whatsapp', 'sms'],
        subject = 'Notification Alert',
        message,
        metadata = {}
      } = req.body;

      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'The `message` parameter is required.'
        });
      }

      const dispatchSummary = await notificationService.sendToRecipients({
        recipients,
        channels,
        subject,
        message,
        metadata
      });

      const effectiveBatchId = batch_id || `BATCH-${Date.now().toString(36).toUpperCase()}`;

      return res.status(200).json({
        success: true,
        batch_id: effectiveBatchId,
        timestamp: dispatchSummary.timestamp,
        results: dispatchSummary.results,
        data: dispatchSummary
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/notifications/history
   * Retrieve notification audit history logs
   */
  async getHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const history = await notificationService.getNotificationHistory(limit);

      return res.status(200).json({
        success: true,
        count: history.length,
        data: history
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new NotificationController();
