// warns if a staff account still uses the demo password
const { pool } = require('../../../shared/server/src/config/db');
const { comparePassword } = require('../../../shared/server/src/utils/passwordHasher');

// the password the seed script gives every demo account
const DEMO_PASSWORD = 'Demo@1234';

async function warnAboutDemoPasswords() {
  // all active admins and tutors
  const [rows] = await pool.execute(
    `SELECT email, role, password_hash FROM users WHERE status = 'ACTIVE' AND role IN ('ADMIN', 'TUTOR')`
  );
  // check each one against the demo password (on worker threads)
  const matches = await Promise.all(rows.map((row) => comparePassword(DEMO_PASSWORD, row.password_hash)));
  // the staff accounts that still use the demo password
  const exposed = rows.filter((row, index) => matches[index]).map((row) => `${row.email} (${row.role})`);
  if (exposed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[security] These accounts still use the demo password - change them before the site is public: ${exposed.join(', ')}`
    );
  }
}

module.exports = { warnAboutDemoPasswords };
