// Checks whether optional database updates have been applied, so features
// switch on by themselves once sql/update_database.sql has been run.
// Results are cached for 30 seconds, so no restart is needed afterwards.
const { pool } = require('../config/db');
const ApiError = require('./ApiError');

const CACHE_MS = 30 * 1000;
const UPDATE_FILE = 'sql/update_database.sql';
const cache = new Map();

async function cached(key, lookup) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await lookup();
  cache.set(key, { value, at: Date.now() });
  return value;
}

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

async function hasReregistration() {
  return (await hasTable('student_reregistration_keys')) && (await hasColumn('users', 'reregistered_for_year'));
}

function hasPayoutTracking() {
  return hasColumn('tutor_payouts', 'status');
}

function hasClassStartDate() {
  return hasColumn('classes', 'start_date');
}

// cancelled class days and extra classes
function hasClassEvents() {
  return hasTable('class_events');
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
  migrationRequired,
  reportPendingUpdates,
};
