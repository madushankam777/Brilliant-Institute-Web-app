// Seeds a demo tutor/student and a couple of sample feedback tickets.
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

// create a demo feedback ticket if the student has none with the same subject
async function upsertDemoTicket(studentId, { category, subject, message, priority }) {
  const [existingRows] = await pool.execute(
    'SELECT id FROM feedback_complaints WHERE subject = ? AND submitted_by = ?',
    [subject, studentId]
  );
  if (existingRows[0]) return existingRows[0].id;

  const [result] = await pool.execute(
    `INSERT INTO feedback_complaints
       (ticket_number, submitted_by, category, subject, message, priority, status, responses, created_at)
     VALUES ('PENDING', ?, ?, ?, ?, ?, 'PENDING', JSON_ARRAY(), NOW())`,
    [studentId, category, subject, message, priority]
  );
  // ticket number such as FB-0001, made from the row id
  const ticketNumber = `FB-${String(result.insertId).padStart(4, '0')}`;
  await pool.execute('UPDATE feedback_complaints SET ticket_number = ? WHERE id = ?', [
    ticketNumber,
    result.insertId,
  ]);
  return result.insertId;
}

// seed the demo tutor, student and a sample feedback ticket, then print the demo logins
async function run() {
  console.log('[seed] Creating demo tutor and student accounts...');
  await upsertDemoUser({ fullName: 'Demo Tutor', email: 'tutor@brilliant.test', role: 'TUTOR' });
  const studentId = await upsertDemoUser({
    fullName: 'Demo Student',
    email: 'student@brilliant.test',
    role: 'STUDENT_PARENT',
  });

  console.log('[seed] Creating a sample feedback ticket...');
  await upsertDemoTicket(studentId, {
    category: 'Class Quality & Tutor Feedback',
    subject: 'Math Form 4 syllabus question',
    message: 'I am having trouble following the quadratic equations section. Could the tutor share extra practice material?',
    priority: 'HIGH',
  });

  console.log('\n[seed] Done! You can log in with:');
  console.log(`  Tutor   -> tutor@brilliant.test   / ${DEMO_PASSWORD}`);
  console.log(`  Student -> student@brilliant.test / ${DEMO_PASSWORD}`);
  process.exit(0);
}

// run it, and exit with an error code if it fails
run().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
