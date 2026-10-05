// bell notifications - one place that saves them, with the page a click opens
const { pool } = require('../config/db');
const schema = require('./schemaFeatures');

// newer kinds fall back to an older kind until sql/update_database.sql has been run
const LEGACY_TYPE = {
  PAYMENT_DUE: 'FEE_DUE',
  ENROLMENT_AT_RISK: 'FEE_DUE',
  ENROLMENT_RELEASED: 'FEE_DUE',
  SEAT_AVAILABLE: 'CLASS_REMINDER',
};

// save one notification for one person (link = where a click on it goes)
async function createNotification({ recipientId, type, message, sentBy = null, link = null, channel = 'IN_APP' }) {
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
    return;
  }
  await pool.execute(
    `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [recipientId, channel, savedType, text, sentBy]
  );
}

// the page an older notification (saved without a link) should open
function defaultLinkFor(type, role) {
  if (type === 'PAYMENT_SUBMITTED') return '/admin/payments/verify';
  if (type === 'PAYMENT_APPROVED' || type === 'PAYMENT_REJECTED') return '/payments/history';
  if (type === 'FEE_DUE' || type === 'PAYMENT_DUE' || type === 'ENROLMENT_AT_RISK') return '/payments';
  if (type === 'ENROLMENT_RELEASED') return '/courses/my-courses';
  if (type === 'SEAT_AVAILABLE') return '/courses/classes';
  if (type === 'LOW_ATTENDANCE') return role === 'STUDENT_PARENT' ? '/attendance/history' : '/attendance/classes';
  if (type === 'REREGISTRATION') return role === 'ADMIN' ? '/admin/reregistration' : '/reregister';
  if (type === 'PAYOUT_RECORDED') return role === 'ADMIN' ? '/admin/payments/tutors' : '/profile';
  if (type === 'CLASS_REMINDER' || type === 'REMINDER') return '/calendar';
  return null;
}

module.exports = { createNotification, defaultLinkFor, LEGACY_TYPE };
