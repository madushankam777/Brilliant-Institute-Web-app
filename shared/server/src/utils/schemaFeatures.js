// Checks whether optional database updates have been applied
const { pool } = require('../config/db');
const ApiError = require('./ApiError');

// answers are remembered for 30 seconds, so the database is not asked on every request
const CACHE_MS = 30 * 1000;
const UPDATE_FILE = 'sql/update_database.sql';
const cache = new Map();

// ask once, then reuse the answer for 30 seconds
async function cached(key, lookup) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await lookup();
  cache.set(key, { value, at: Date.now() });
  return value;
}

// does this table exist?
function hasTable(table) {
  return cached(`t:${table}`, async () => {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [table]
    );
    return rows.length > 0;
  });
}

// does this column exist?
function hasColumn(table, column) {
  return cached(`c:${table}.${column}`, async () => {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column]
    );
    return rows.length > 0;
  });
}

// is the re-registration update applied?
async function hasReregistration() {
  return (await hasTable('student_reregistration_keys')) && (await hasColumn('users', 'reregistered_for_year'));
}

// is the payout tracking update applied?
function hasPayoutTracking() {
  return hasColumn('tutor_payouts', 'status');
}

// do classes have a start date column?
function hasClassStartDate() {
  return hasColumn('classes', 'start_date');
}

// cancelled class days and extra classes
function hasClassEvents() {
  return hasTable('class_events');
}

// notification bell - links, "cleared" kept on the server, and cleared announcements
async function hasNotificationCentre() {
  return (
    (await hasColumn('notification_log', 'link')) &&
    (await hasColumn('notification_log', 'dismissed_at')) &&
    (await hasTable('announcement_dismissals'))
  );
}

// can notification_log.type hold any kind (VARCHAR), or only the old fixed list (ENUM)?
function hasFreeTextNotificationTypes() {
  return cached('free-notification-types', async () => {
    const [rows] = await pool.execute(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_log' AND COLUMN_NAME = 'type' LIMIT 1`
    );
    return Boolean(rows[0]) && String(rows[0].DATA_TYPE).toLowerCase() === 'varchar';
  });
}

// pay-by date on new enrolments (unpaid places are released after it)
async function hasPaymentDeadlines() {
  return (await hasColumn('enrollments', 'payment_due_at')) && (await hasColumn('enrollments', 'payment_warned_at'));
}

// students waiting for a seat in a full class
function hasClassWaitlist() {
  return hasTable('class_waitlist');
}

// the bell knows what is read and unread (notifications and announcements)
async function hasNotificationReadState() {
  return (await hasColumn('notification_log', 'read_at')) && (await hasTable('announcement_reads'));
}

// feedback tickets remember what each person has read and deleted from their list
function hasFeedbackReads() {
  return hasTable('feedback_reads');
}

// admins can remove entries from the Recent reports list
function hasReportHistoryHidden() {
  return hasTable('report_history_hidden');
}

// card payments have their own settlement bank account
function hasCardAccount() {
  return hasColumn('payment_settings', 'card_account_number');
}

// sign-up email codes are kept in MySQL
function hasSignupCodes() {
  return hasTable('signup_codes');
}

// logged-out sessions are kept in MySQL
function hasRevokedSessions() {
  return hasTable('revoked_sessions');
}

// wrong reset-code tries are counted in MySQL
function hasResetTries() {
  return hasColumn('password_reset_tokens', 'failed_tries');
}

// cookie banner choices are kept in MySQL
function hasCookieConsents() {
  return hasTable('cookie_consents');
}

// notifications remember when their email went out (so each is emailed once)
async function hasNotificationEmails() {
  return (await hasColumn('notification_log', 'emailed_at')) && (await hasColumn('notification_log', 'email_tries'));
}

// Setup steps belong in the server log - users only see a short message.
function migrationRequired() {
  console.warn(`[setup] This action needs the database update. Run ${UPDATE_FILE} once as root in MySQL Workbench.`);
  return new ApiError(503, 'This feature is not available yet. Please contact your system administrator.');
}

// Printed once at startup so the developer knows what is still switched off.
async function reportPendingUpdates() {
  const missing = [];
  if (!(await hasReregistration())) missing.push('student re-registration');
  if (!(await hasPayoutTracking())) missing.push('payout tracking');
  if (!(await hasClassStartDate())) missing.push('class start dates');
  if (!(await hasClassEvents())) missing.push('cancelled and extra classes');
  if (!(await hasTable('contact_messages'))) missing.push('contact us messages');
  if (!(await hasTable('uploaded_files'))) missing.push('uploads stored in MySQL');
  if (!(await hasNotificationCentre())) missing.push('notification links and cleared notifications');
  if (!(await hasPaymentDeadlines())) missing.push('payment deadlines for new enrolments');
  if (!(await hasClassWaitlist())) missing.push('waiting list for full classes');
  if (!(await hasNotificationEmails())) missing.push('emailing scheduled reminders and retrying failed emails');
  if (!(await hasNotificationReadState())) missing.push('read / unread notifications');
  if (!(await hasFeedbackReads())) missing.push('read / delete for feedback tickets');
  if (!(await hasReportHistoryHidden())) missing.push('deleting recent reports');
  if (!(await hasCardAccount())) missing.push('a separate bank account for card payments');
  if (!(await hasSignupCodes())) missing.push('sign-up email codes');
  if (!(await hasRevokedSessions())) missing.push('logging out on the server');
  if (!(await hasResetTries())) missing.push('counting wrong reset codes');
  if (!(await hasCookieConsents())) missing.push('saving cookie choices');

  if (missing.length > 0) {
    console.warn(
      `[setup] Database update pending (${missing.join(', ')}). ` +
        `Run ${UPDATE_FILE} once as root in MySQL Workbench.`
    );
  }
  return missing;
}

module.exports = {
  hasTable,
  hasColumn,
  hasReregistration,
  hasPayoutTracking,
  hasClassStartDate,
  hasClassEvents,
  hasNotificationCentre,
  hasFreeTextNotificationTypes,
  hasPaymentDeadlines,
  hasClassWaitlist,
  hasNotificationEmails,
  hasNotificationReadState,
  hasFeedbackReads,
  hasReportHistoryHidden,
  hasCardAccount,
  hasSignupCodes,
  hasRevokedSessions,
  hasResetTries,
  hasCookieConsents,
  migrationRequired,
  reportPendingUpdates,
};
