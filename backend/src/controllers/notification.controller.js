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
        // NOTE: req.body.recipients is intentionally ignored — recipients are
        // always loaded from the DB to prevent use as an open messaging relay.
        channels = ['email', 'whatsapp', 'sms'],
        subject = 'Notification Alert',
        message,
        metadata = {},
        amount = null
      } = req.body;

      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'The `message` parameter is required.'
        });
      }

      const dispatchSummary = await notificationService.sendToRecipients({
        channels,
        subject,
        message,
        amount,
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
   * POST /api/notifications/dispatch-stream
   * SSE endpoint — streams each send result as it completes
   */
  async streamNotifications(req, res, next) {
    try {
      // req.body.recipients is intentionally ignored (open-relay prevention); DB recipients are used.
      const { channels, subject = 'Notification Alert', message, metadata = {}, amount = null } = req.body;

      if (!message || message.trim() === '') {
        return res.status(400).json({ success: false, message: 'The `message` parameter is required.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const dispatchSummary = await notificationService.sendToRecipients({
        channels, subject, message, metadata, amount,
        onResult: (item) => {
          if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'result', ...item })}\n\n`);
        }
      });

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', summary: dispatchSummary })}\n\n`);
        res.end();
      }
    } catch (err) {
      // Failure before the SSE stream opened: normal error handler is still safe.
      if (!res.headersSent) return next(err);
      // SSE headers are already sent — don't call next(err) (would cause ERR_HTTP_HEADERS_SENT).
      console.error(`[NotificationController] SSE dispatch error: ${err.message}`);
      try {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
          res.end();
        }
      } catch {}
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
