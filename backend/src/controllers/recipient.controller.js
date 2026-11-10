const db = require('../db/database');

class RecipientController {
  /**
   * GET /api/recipients
   * List all configured notification recipients (primary & secondary)
   */
  async getRecipients(req, res, next) {
    try {
      const recipients = await db.getRecipients();
      // Return both array and envelope so any frontend format works seamlessly
      return res.status(200).json(recipients);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/recipients/:id
   * Update details for a recipient (email, phone, whatsapp, name)
   */
  async updateRecipient(req, res, next) {
    try {
      const { id } = req.params;
      const { name, email, phone, whatsapp } = req.body;

      const existing = await db.getRecipientById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: `Recipient with ID ${id} not found.`
        });
      }

      const updated = await db.updateRecipient(id, {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(whatsapp !== undefined && { whatsapp })
      });

      return res.status(200).json({
        success: true,
        message: 'Recipient updated successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/recipients
   * Batch update/save recipients list from frontend settings
   */
  async saveRecipients(req, res, next) {
    try {
      const { recipients } = req.body;
      if (!Array.isArray(recipients)) {
        return res.status(400).json({
          success: false,
          message: 'The `recipients` field must be an array.'
        });
      }

      for (const r of recipients) {
        if (r.id) {
          await db.updateRecipient(r.id, r);
        } else {
          await db.addRecipient(r);
        }
      }

      const current = await db.getRecipients();
      return res.status(200).json({
        success: true,
        message: 'Recipients synchronized successfully.',
        data: current
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RecipientController();
