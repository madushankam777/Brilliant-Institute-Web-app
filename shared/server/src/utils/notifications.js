// bell notifications - one place that saves them (with the page a click opens) and emails them
const { pool } = require('../config/db');
const schema = require('./schemaFeatures');
const { LEGACY_TYPE, defaultLinkFor } = require('./notificationTypes');
const { notificationSaved } = require('./notificationEmails');

// save one notification for one person (link = where a click on it goes); it is emailed to them too
async function createNotification({ recipientId, type, message, sentBy = null, link = null, channel = 'IN_APP' }) {
  if (!recipientId) return;
  const freeText = await schema.hasFreeTextNotificationTypes();
  const savedType = freeText ? type : LEGACY_TYPE[type] || type;
  const text = String(message).slice(0, 500);
  const safeLink = link ? String(link).slice(0, 255) : null;

  if (await schema.hasNotificationCentre()) {
    await pool.execute(
      `INSERT INTO notification_log (recipient_id, channel, type, message, link, sent_by, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [recipientId, channel, savedType, text, safeLink, sentBy]
    );
  } else {
    await pool.execute(
      `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [recipientId, channel, savedType, text, sentBy]
    );
  }

  // the email - a mail problem never stops the action that made the notification
  notificationSaved({ recipientId, type, message: text, link: safeLink }).catch(() => {});
}

// save the same notification for several people
async function notifyMany(recipientIds, notification) {
  for (const recipientId of new Set(recipientIds)) {
    await createNotification({ ...notification, recipientId });
  }
}

// ids of every active admin (they hear about slips, feedback and enquiries)
async function findActiveAdminIds() {
  const [rows] = await pool.execute(`SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
  return rows.map((row) => row.id);
}

module.exports = { createNotification, notifyMany, findActiveAdminIds, defaultLinkFor, LEGACY_TYPE };
