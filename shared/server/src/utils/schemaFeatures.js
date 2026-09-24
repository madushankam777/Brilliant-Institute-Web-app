// Lets code check whether an optional migration has been applied, so pages
// keep working on an older database instead of failing outright. Results are
// cached briefly, so running the migration takes effect without a restart.
const { pool } = require('../config/db');
const ApiError = require('./ApiError');

const CACHE_MS = 30 * 1000;
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

// Re-registration needs its own table plus the new users columns.
async function hasReregistration() {
  return (await hasTable('student_reregistration_keys')) && (await hasColumn('users', 'reregistered_for_year'));
}

// The payout transfer workflow needs the new tutor_payouts columns.
function hasPayoutTracking() {
  return hasColumn('tutor_payouts', 'status');
}

const MIGRATION_MESSAGE =
  'This action needs a one-time database update. In MySQL Workbench, connect as root and run ' +
  'sql/migration_student_reregistration_and_payouts.sql, then try again.';

function migrationRequired() {
  return new ApiError(503, MIGRATION_MESSAGE);
}

module.exports = { hasTable, hasColumn, hasReregistration, hasPayoutTracking, migrationRequired, MIGRATION_MESSAGE };
