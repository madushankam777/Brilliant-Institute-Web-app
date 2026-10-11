// emails for bell notifications - each one waits in notification_log until emailed (sent straight away before the database update)
const { pool } = require('../config/db');
const config = require('../config/env');
const schema = require('./schemaFeatures');
const { sendMail, canReceiveEmail, isSmtpReady } = require('./mailer');
const { renderEmail } = require('./emailLayout');
const { toSafeNotification } = require('./sanitize');
const { defaultLinkFor } = require('./notificationTypes');

// how often waiting emails are checked
const CHECK_EVERY_MS = 30 * 1000;
// a failed email is tried this many times
const MAX_TRIES = 10;
// emails per round
const BATCH_SIZE = 25;
// errors that mean the mail server (not this email) is the problem - login refused, no connection
const MAIL_SERVER_DOWN = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'];

// the same warning at most once every 10 minutes, so an outage does not flood the log
let lastWarnAt = 0;
function warnNow(message) {
  if (Date.now() - lastWarnAt < 10 * 60 * 1000) return;
  lastWarnAt = Date.now();
  // eslint-disable-next-line no-console
  console.warn(message);
}

// only the running API sends emails (test copies and scripts do not)
let started = false;
// emails go out one after another, so Gmail is not flooded
let queue = Promise.resolve();

// add one email job to the queue
function enqueue(job) {
  queue = queue.then(job).catch((error) => warnNow(`[mail] an email could not be sent: ${error.message}`));
  return queue;
}

// the full website address of a page
function siteLink(link) {
  return `${config.siteUrl}${link && String(link).startsWith('/') ? link : '/'}`;
}

// short subject line - the title, then the start of the message
function subjectFor(title, message) {
  const text = String(message).replace(/\s+/g, ' ').trim();
  const short = text.length > 80 ? `${text.slice(0, 80).replace(/\s+\S*$/, '')}...` : text;
  return short.toLowerCase().startsWith(title.toLowerCase()) ? short : `${title}: ${short}`;
}

// one notification as an email (same title and text as the bell)
function buildNotificationEmail({ type, message, link, fullName, role }) {
  const item = toSafeNotification({ type, message });
  const { html, text } = renderEmail({
    name: fullName,
    heading: item.title,
    message: item.message,
    buttonText: 'View details',
    buttonUrl: siteLink(link || defaultLinkFor(item.type, role)),
  });
  return { subject: subjectFor(item.title, item.message), html, text };
}

// email one account - false when it is closed or the address cannot receive mail
async function emailUser(user, email) {
  if (!user || user.status === 'DELETED' || !canReceiveEmail(user.email)) return false;
  await sendMail({ to: user.email, ...email });
  return true;
}

// notifications that are due and not emailed yet (the last 2 days only)
async function listWaitingEmails() {
  const [rows] = await pool.query(
    `SELECT n.id, n.type, n.message, n.link, u.email, u.full_name, u.role, u.status
     FROM notification_log n
     JOIN users u ON u.id = n.recipient_id
     WHERE n.emailed_at IS NULL AND n.email_tries < ?
       AND n.sent_at <= NOW() AND n.sent_at >= NOW() - INTERVAL 2 DAY
     ORDER BY n.id
     LIMIT ?`,
    [MAX_TRIES, BATCH_SIZE]
  );
  return rows;
}

// email the waiting notifications - each row is claimed first, so it is never sent twice
let checking = false;
let checkAgain = false;
async function sendWaitingEmails() {
  if (checking) {
    checkAgain = true;
    return;
  }
  checking = true;
  try {
    do {
      checkAgain = false;
      const rows = await listWaitingEmails();
      for (const row of rows) {
        const [claimed] = await pool.execute(
          'UPDATE notification_log SET emailed_at = NOW() WHERE id = ? AND emailed_at IS NULL',
          [row.id]
        );
        if (claimed.affectedRows === 0) continue;
        try {
          await emailUser(row, buildNotificationEmail({ ...row, fullName: row.full_name }));
        } catch (error) {
          // not sent - give it back and stop this round; a mail server outage does not use up its tries
          const serverDown = MAIL_SERVER_DOWN.includes(error.code);
          await pool.execute(
            `UPDATE notification_log SET emailed_at = NULL, email_tries = email_tries + ? WHERE id = ?`,
            [serverDown ? 0 : 1, row.id]
          );
          warnNow(`[mail] notification emails are waiting and will be retried: ${error.message}`);
          return;
        }
      }
      if (rows.length === BATCH_SIZE) checkAgain = true;
    } while (checkAgain);
  } finally {
    checking = false;
  }
}

// a waiting-emails round that only logs its errors
function sendWaitingEmailsQuietly() {
  return sendWaitingEmails().catch((error) => {
    // eslint-disable-next-line no-console
    console.warn(`[mail] could not check waiting notification emails: ${error.message}`);
  });
}

// a notification was just saved - email it
async function notificationSaved({ recipientId, type, message, link }) {
  if (!started) return;
  if (await schema.hasNotificationEmails()) {
    setImmediate(sendWaitingEmailsQuietly);
    return;
  }
  // before the database update - send it straight away
  enqueue(async () => {
    const [rows] = await pool.execute('SELECT email, full_name, role, status FROM users WHERE id = ?', [recipientId]);
    const user = rows[0];
    if (user) await emailUser(user, buildNotificationEmail({ type, message, link, fullName: user.full_name, role: user.role }));
  });
}

// a new or edited announcement - email everyone it is for (the same people who see it in the bell)
async function emailAnnouncement(announcement, { updated = false, publisherId = null } = {}) {
  if (!started || !announcement || announcement.status !== 'PUBLISHED') return 0;
  const audience = announcement.target_audience;
  const grade = announcement.target_grade || null;
  const [people] = await pool.execute(
    `SELECT email, full_name, role, status FROM users
     WHERE status = 'ACTIVE' AND id <> ?
       AND (? = 'ALL' OR role = ?)
       AND (? IS NULL OR grade = ?)`,
    [publisherId || 0, audience, audience, grade, grade]
  );

  const title = `${updated ? 'Updated: ' : ''}${announcement.title}`;
  const subject = announcement.priority === 'HIGH' ? `Important: ${title}` : title;
  const recipients = people.filter((person) => canReceiveEmail(person.email));
  for (const person of recipients) {
    const { html, text } = renderEmail({
      name: person.full_name,
      heading: title,
      message: announcement.body,
      buttonText: 'Open Brilliant Institute',
      buttonUrl: siteLink(person.role === 'ADMIN' ? '/admin/announcements' : '/'),
    });
    enqueue(() => sendMail({ to: person.email, subject, html, text }));
  }
  return recipients.length;
}

// email someone straight away without a bell item (e.g. an account that was just closed)
function emailPerson({ to, name, heading, message, link = null }) {
  if (!started || !canReceiveEmail(to)) return;
  const { html, text } = renderEmail({
    name,
    heading,
    message,
    buttonText: 'Open Brilliant Institute',
    buttonUrl: link ? siteLink(link) : null,
  });
  enqueue(() => sendMail({ to, subject: heading, html, text }));
}

// start emailing (server.js only) - a check soon after start-up, then every 30 seconds
let timer = null;
function startNotificationEmails() {
  if (timer) return;
  if (!config.mail.notifications) {
    // eslint-disable-next-line no-console
    console.log('[mail] Notification emails are switched off (NOTIFICATION_EMAILS=off).');
    return;
  }
  if (config.isProduction && !isSmtpReady() && !config.mail.resendApiKey) {
    // eslint-disable-next-line no-console
    console.warn('[setup] Notification emails are off until email is set up (SMTP_PASS or RESEND_API_KEY).');
    return;
  }
  started = true;
  const run = () =>
    schema
      .hasNotificationEmails()
      .then((ready) => ready && sendWaitingEmailsQuietly())
      .catch(() => {});
  setTimeout(run, 5 * 1000).unref();
  timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
}

module.exports = {
  startNotificationEmails,
  notificationSaved,
  sendWaitingEmails,
  emailAnnouncement,
  emailPerson,
  buildNotificationEmail,
};
