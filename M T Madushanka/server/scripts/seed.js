// Seeds a demo tutor, student, class and enrollment
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

// create the demo Saturday maths class if it does not exist
async function upsertDemoClass(tutorId) {
  const [existingRows] = await pool.execute(
    "SELECT id FROM classes WHERE subject = 'Combined Mathematics (Demo)' AND tutor_id = ?",
    [tutorId]
  );
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO classes (subject, tutor_id, venue, day_of_week, start_time, end_time, capacity, fee, status)
     VALUES ('Combined Mathematics (Demo)', ?, 'Hall A', 'Saturday', '09:00:00', '11:00:00', 30, 3500.00, 'ACTIVE')`,
    [tutorId]
  );
  return result.insertId;
}

// create two demo sessions - last week and today
async function upsertDemoSessions(classId) {
  const [existingRows] = await pool.execute(
    'SELECT id FROM class_sessions WHERE class_id = ?',
    [classId]
  );
  if (existingRows.length > 0) {
    return;
  }

  await pool.execute(
    `INSERT INTO class_sessions (class_id, session_date, start_time, end_time)
     VALUES (?, DATE_SUB(CURDATE(), INTERVAL 7 DAY), '09:00:00', '11:00:00'),
            (?, CURDATE(), '09:00:00', '11:00:00')`,
    [classId, classId]
  );
}

// enrol the demo student in the demo class
async function upsertDemoEnrollment(studentId, classId) {
  const [existingRows] = await pool.execute(
    'SELECT id FROM enrollments WHERE student_id = ? AND class_id = ?',
    [studentId, classId]
  );
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO enrollments (student_id, class_id, status, balance, enrolled_at)
     VALUES (?, ?, 'ACTIVE', 3500.00, NOW())`,
    [studentId, classId]
  );
  return result.insertId;
}

// seed everything in order, then print the demo logins
async function run() {
  console.log('[seed] Creating demo tutor and student accounts...');
  const tutorId = await upsertDemoUser({
    fullName: 'Demo Tutor',
    email: 'tutor@brilliant.test',
    role: 'TUTOR',
  });
  const studentId = await upsertDemoUser({
    fullName: 'Demo Student',
    email: 'student@brilliant.test',
    role: 'STUDENT_PARENT',
  });

  console.log('[seed] Creating demo class and sessions...');
  const classId = await upsertDemoClass(tutorId);
  await upsertDemoSessions(classId);
  await upsertDemoEnrollment(studentId, classId);

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
