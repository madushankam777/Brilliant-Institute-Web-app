// Warns in the server log if an active staff account still uses the demo
// password from the seed scripts - anyone who has seen the README could
// log in with it.
const bcrypt = require('bcryptjs');
const { pool } = require('../../../shared/server/src/config/db');

const DEMO_PASSWORD = 'Demo@1234';

async function warnAboutDemoPasswords() {
  const [rows] = await pool.execute(
    `SELECT email, role, password_hash FROM users WHERE status = 'ACTIVE' AND role IN ('ADMIN', 'TUTOR')`
  );
  const exposed = [];
  for (const row of rows) {
    if (await bcrypt.compare(DEMO_PASSWORD, row.password_hash)) exposed.push(`${row.email} (${row.role})`);
  }
  if (exposed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[security] These accounts still use the demo password - change them before the site is public: ${exposed.join(', ')}`
    );
  }
}

module.exports = { warnAboutDemoPasswords };
