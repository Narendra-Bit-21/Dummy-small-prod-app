const axios = require('axios');
const config = require('../config/env');
const db = require('../db/database');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this._initTransporter();
  }

  _initTransporter() {
    if (nodemailer && config.gmail.isConfigured) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          requireTLS: true,
          auth: {
            user: config.gmail.user,
            pass: config.gmail.appPassword.replace(/\s+/g, '')
          },
          tls: { rejectUnauthorized: false }
        });
        console.log(`[NotificationService] Gmail SMTP transporter configured for ${config.gmail.user}`);
      } catch (err) {
        console.warn(`[NotificationService] Failed to create Gmail transporter: ${err.message}`);
        this.emailTransporter = null;
      }
    } else {
      console.log('[NotificationService] Gmail App Password not provided. Emails will run in simulated preview mode.');
    }
  }

  /**
   * HTML Email Template Builder
   */
  _buildEmailHtml({ recipientName, subject, message, metadata = {} }) {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let metaHtml = '';
    if (Object.keys(metadata).length > 0) {
      metaHtml = `
        <div style="margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Transaction Details</h4>
          <table style="width: 100%; font-size: 14px; color: #475569; border-collapse: collapse;">
            ${Object.entries(metadata)
              .map(
                ([k, v]) => `
              <tr>
                <td style="padding: 4px 0; font-weight: 600; text-transform: capitalize; width: 40%;">${k.replace(/_/g, ' ')}:</td>
                <td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${String(v)}</td>
              </tr>
            `
              )
              .join('')}
          </table>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
              ${config.gmail.fromName}
            </h1>
            <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">Official Notification & Alert Dispatch</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 28px 24px;">
            <p style="font-size: 16px; color: #1e293b; margin-top: 0;">
              Hello <strong>${recipientName || 'Valued User'}</strong>,
            </p>

            <div style="font-size: 15px; line-height: 1.6; color: #334155; margin: 16px 0; padding: 16px; background-color: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 4px;">
              ${message.replace(/\n/g, '<br/>')}
            </div>

            ${metaHtml}

            <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
              Timestamp: <strong>${timestamp} IST</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              This is an automated notification from your Payment & Alert Dispatch Hub.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send Email to a specific recipient
   */
  async sendEmail({ to, recipientName, subject, message, metadata = {} }) {
    if (!to || !to.includes('@')) {
      console.warn(`[NotificationService] Skipping email to ${recipientName}: invalid or empty address "${to}"`);
      return { success: false, status: 'failed', channel: 'email', target: to || '', error: 'Invalid or empty email address' };
    }

    const html = this._buildEmailHtml({ recipientName, subject, message, metadata });

    if (this.emailTransporter && config.gmail.isConfigured) {
      try {
        const info = await this.emailTransporter.sendMail({
          from: `"${config.gmail.fromName}" <${config.gmail.user}>`,
          to,
          subject: subject || 'Notification Alert',
          text: message,
          html
        });

        console.log(`[NotificationService] Email dispatched successfully to ${to} (MessageId: ${info.messageId})`);
        return {
          success: true,
          status: 'sent',
          channel: 'email',
          target: to,
          externalId: info.messageId
        };
      } catch (err) {
        console.error(`[NotificationService] Gmail dispatch error to ${to}: ${err.message}`);
        return {
          success: false,
          status: 'failed',
          channel: 'email',
          target: to,
          error: `Gmail SMTP Error: ${err.message}`
        };
      }
    }

    // Simulated email fallback when credentials are not yet entered
    console.log(`[NotificationService] [SIMULATED EMAIL] To: ${to} | Subject: ${subject}`);
    return {
      success: true,
      status: 'simulated',
      channel: 'email',
      target: to,
      notice: 'Simulated email delivery. Set GMAIL_APP_PASSWORD in .env to dispatch live emails.',
      preview: { subject, to, snippet: message.slice(0, 100) }
    };
  }

  /**
   * Send WhatsApp Message via Twilio or Fallback Intent
   */
  async sendWhatsApp({ phone, recipientName, message }) {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const waPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone.replace(/^0+/, '')}`;
    const directUrl = `https://wa.me/${waPhone.replace('+', '')}?text=${encodeURIComponent(message)}`;

    if (config.twilio.isConfigured) {
      try {
        const authHeader = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
        const params = new URLSearchParams();
        params.append('From', config.twilio.whatsappNumber);
        params.append('To', `whatsapp:${waPhone}`);
        params.append('Body', message);

        const response = await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
          params.toString(),
          {
            headers: {
              Authorization: `Basic ${authHeader}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          }
        );

        console.log(`[NotificationService] WhatsApp dispatched via Twilio to ${waPhone} (SID: ${response.data.sid})`);
        return {
          success: true,
          status: 'sent',
          channel: 'whatsapp',
          target: waPhone,
          externalId: response.data.sid,
          directIntentUrl: directUrl
        };
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[NotificationService] Twilio WhatsApp error: ${errMsg}`);
        return {
          success: false,
          status: 'failed',
          channel: 'whatsapp',
          target: waPhone,
          error: `Twilio Error: ${errMsg}`,
          directIntentUrl: directUrl
        };
      }
    }

    // Direct Intent Fallback (Zero Setup Required)
    console.log(`[NotificationService] [SIMULATED WHATSAPP] Direct link ready for ${waPhone}`);
    return {
      success: true,
      status: 'simulated',
      channel: 'whatsapp',
      target: waPhone,
      directIntentUrl: directUrl,
      notice: 'Twilio WhatsApp not configured. Click the direct wa.me link to send instantly from browser/mobile.'
    };
  }

  /**
   * Send SMS via Twilio or Fast2SMS with clean fallback
   */
  async sendSMS({ phone, recipientName, message }) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const indianPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

    // 1. Try Fast2SMS if configured (common for Indian mobile numbers)
    if (config.fast2sms.isConfigured) {
      try {
        const response = await axios.post(
          'https://www.fast2sms.com/dev/bulkV2',
          {
            route: 'v3',
            message: message.slice(0, 160),
            language: 'english',
            flash: 0,
            numbers: indianPhone
          },
          {
            headers: {
              authorization: config.fast2sms.apiKey
            },
            timeout: 8000
          }
        );

        if (response.data.return === true) {
          return {
            success: true,
            status: 'sent',
            channel: 'sms',
            target: indianPhone,
            externalId: response.data.request_id
          };
        }
      } catch (fErr) {
        console.warn(`[NotificationService] Fast2SMS error: ${fErr.message}`);
      }
    }

    // 2. Try Twilio SMS if configured
    if (config.twilio.isConfigured && config.twilio.phoneNumber) {
      try {
        const authHeader = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
        const params = new URLSearchParams();
        params.append('From', config.twilio.phoneNumber);
        params.append('To', phone.startsWith('+') ? phone : `+91${indianPhone}`);
        params.append('Body', message.slice(0, 160));

        const response = await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
          params.toString(),
          {
            headers: {
              Authorization: `Basic ${authHeader}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          }
        );

        return {
          success: true,
          status: 'sent',
          channel: 'sms',
          target: phone,
          externalId: response.data.sid
        };
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[NotificationService] Twilio SMS error: ${errMsg}`);
        return {
          success: false,
          status: 'failed',
          channel: 'sms',
          target: phone,
          error: `SMS Gateway Error: ${errMsg}`
        };
      }
    }

    // 3. Fallback simulated log
    console.log(`[NotificationService] [SIMULATED SMS] Phone: ${phone} | Body: ${message}`);
    return {
      success: true,
      status: 'simulated',
      channel: 'sms',
      target: phone,
      notice: 'SMS gateway not configured in .env. Simulated dispatch logged.'
    };
  }

  /**
   * Batch Sender: Dispatches to the 2 recipients across all selected channels
   */
  async sendToRecipients({ recipients = null, channels = ['email', 'whatsapp', 'sms'], subject = 'Important Alert', message, metadata = {}, amount = null }) {
    if (!message || message.trim() === '') {
      throw new Error('Message content is required for dispatch.');
    }

    // Default to the 2 recipients in database if not provided
    const targetRecipients = recipients && recipients.length > 0
      ? recipients
      : await db.getRecipients();

    if (!targetRecipients || targetRecipients.length === 0) {
      throw new Error('No recipients found in database to receive notification.');
    }

    const channelList = Array.isArray(channels) && channels.length > 0 ? channels : ['email', 'whatsapp', 'sms'];
    const results = [];

    for (const recipient of targetRecipients) {
      const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const amountStr = amount ? `₹${parseFloat(amount).toFixed(2)}` : '₹1.00';
      const interpolatedMessage = message
        .replace(/\{name\}/gi, recipient.name || 'Valued User')
        .replace(/\{time\}/gi, now)
        .replace(/\{amount\}/gi, amountStr)
        .replace(/\{status\}/gi, 'CONFIRMED');
      const interpolatedSubject = subject
        .replace(/\{name\}/gi, recipient.name || 'Valued User')
        .replace(/\{amount\}/gi, amountStr);

      // 1. Email Channel
      if (channelList.includes('email') && recipient.email) {
        const emailResult = await this.sendEmail({
          to: recipient.email,
          recipientName: recipient.name,
          subject: interpolatedSubject,
          message: interpolatedMessage,
          metadata
        });

        await db.logNotification({
          recipient_id: recipient.id,
          recipient_name: recipient.name,
          recipient_target: recipient.email,
          channel: 'email',
          subject,
          message,
          status: emailResult.status,
          error: emailResult.error || null,
          external_id: emailResult.externalId || null
        });

        results.push({
          recipientId: recipient.id,
          recipientName: recipient.name,
          ...emailResult
        });
      }

      // 2. WhatsApp Channel
      if (channelList.includes('whatsapp') && (recipient.whatsapp || recipient.phone)) {
        const waResult = await this.sendWhatsApp({
          phone: recipient.whatsapp || recipient.phone,
          recipientName: recipient.name,
          message: interpolatedMessage
        });

        await db.logNotification({
          recipient_id: recipient.id,
          recipient_name: recipient.name,
          recipient_target: recipient.whatsapp || recipient.phone,
          channel: 'whatsapp',
          subject,
          message,
          status: waResult.status,
          error: waResult.error || null,
          external_id: waResult.externalId || null
        });

        results.push({
          recipientId: recipient.id,
          recipientName: recipient.name,
          ...waResult
        });
      }

      // 3. SMS Channel
      if (channelList.includes('sms') && recipient.phone) {
        const smsResult = await this.sendSMS({
          phone: recipient.phone,
          recipientName: recipient.name,
          message: interpolatedMessage
        });

        await db.logNotification({
          recipient_id: recipient.id,
          recipient_name: recipient.name,
          recipient_target: recipient.phone,
          channel: 'sms',
          subject,
          message,
          status: smsResult.status,
          error: smsResult.error || null,
          external_id: smsResult.externalId || null
        });

        results.push({
          recipientId: recipient.id,
          recipientName: recipient.name,
          ...smsResult
        });
      }
    }

    const sentCount = results.filter((r) => r.status === 'sent').length;
    const simulatedCount = results.filter((r) => r.status === 'simulated').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    return {
      success: true,
      totalDispatched: results.length,
      sentCount,
      simulatedCount,
      failedCount,
      timestamp: new Date().toISOString(),
      results
    };
  }

  /**
   * Retrieve notification history logs
   */
  async getNotificationHistory(limit = 100) {
    return await db.getNotifications(limit);
  }
}

module.exports = new NotificationService();
