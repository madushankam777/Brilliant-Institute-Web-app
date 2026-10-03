// Seeds a demo admin/tutor/student and one sample announcement.
const bcrypt = require('bcryptjs');
const config = require('../../../shared/server/src/config/env');
const { pool } = require('../../../shared/server/src/config/db');

// password for every demo account (SEED_DEMO_PASSWORD overrides it)
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@1234';

// create the demo user if the email is new, else reuse it
async function upsertDemoUser({ fullName, email, role }) {
  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existingRows[0]) {
    return existingRows[0].id;
  }
  // the demo password is saved hashed, like any other
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.auth.bcryptSaltRounds);
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', NOW())`,
    [fullName, email, passwordHash, role]
  );
  return result.insertId;
}

// create the welcome announcement if it does not exist
async function upsertDemoAnnouncement(adminId) {
  const [existingRows] = await pool.execute(
    "SELECT id FROM announcements WHERE title = 'Welcome to Brilliant Institute'"
  );
  if (existingRows[0]) return existingRows[0].id;

  const [result] = await pool.execute(
    `INSERT INTO announcements (title, body, priority, target_audience, status, published_by, created_at)
     VALUES (?, ?, 'NORMAL', 'ALL', 'PUBLISHED', ?, NOW())`,
    [
      'Welcome to Brilliant Institute',
      'Our new online portal is now live. You can browse classes, mark attendance, pay fees, and raise feedback all in one place.',
      adminId,
    ]
  );
  return result.insertId;
}

// seed the demo admin, tutor, student and a welcome announcement, then print the demo logins
async function run() {
  console.log('[seed] Creating demo admin/tutor/student accounts...');
  const adminId = await upsertDemoUser({
    fullName: 'Admin Vance',
    email: 'admin@brilliant.test',
    role: 'ADMIN',
  });
  await upsertDemoUser({ fullName: 'Demo Tutor', email: 'tutor@brilliant.test', role: 'TUTOR' });
  await upsertDemoUser({
    fullName: 'Demo Student',
    email: 'student@brilliant.test',
    role: 'STUDENT_PARENT',
  });

  console.log('[seed] Creating a sample announcement...');
  await upsertDemoAnnouncement(adminId);

  console.log('\n[seed] Done! You can log in with:');
  console.log(`  Admin   -> admin@brilliant.test   / ${DEMO_PASSWORD}`);
  console.log(`  Tutor   -> tutor@brilliant.test   / ${DEMO_PASSWORD}`);
  console.log(`  Student -> student@brilliant.test / ${DEMO_PASSWORD}`);
  process.exit(0);
}

// run it, and exit with an error code if it fails
run().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
