// Seeds a demo tutor, student, and a couple of browsable classes.
const bcrypt = require('bcryptjs');
const config = require('../../../shared/server/src/config/env');
const { pool } = require('../../../shared/server/src/config/db');

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@1234';

async function upsertDemoUser({ fullName, email, role }) {
  const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.auth.bcryptSaltRounds);
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', NOW())`,
    [fullName, email, passwordHash, role]
  );
  return result.insertId;
}

async function upsertDemoClass(tutorId, data) {
  const [existingRows] = await pool.execute(
    'SELECT id FROM classes WHERE subject = ? AND tutor_id = ?',
    [data.subject, tutorId]
  );
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const [result] = await pool.execute(
    `INSERT INTO classes
       (subject, subject_area, description, level, tutor_id, venue, day_of_week,
        start_time, end_time, capacity, fee, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [
      data.subject,
      data.subjectArea,
      data.description,
      data.level,
      tutorId,
      data.venue,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      data.capacity,
      data.fee,
    ]
  );
  return result.insertId;
}

async function run() {
  console.log('[seed] Creating demo tutor and student accounts...');
  const tutorId = await upsertDemoUser({
    fullName: 'Demo Tutor',
    email: 'tutor@brilliant.test',
    role: 'TUTOR',
  });
  await upsertDemoUser({
    fullName: 'Demo Student',
    email: 'student@brilliant.test',
    role: 'STUDENT_PARENT',
  });

  console.log('[seed] Creating demo browsable classes...');
  await upsertDemoClass(tutorId, {
    subject: 'Combined Mathematics (Demo)',
    subjectArea: 'Mathematics',
    description: 'A comprehensive syllabus covering algebra, geometry, and introductory calculus.',
    level: 'Form 4',
    venue: 'Hall A',
    dayOfWeek: 'Saturday',
    startTime: '09:00:00',
    endTime: '11:00:00',
    capacity: 30,
    fee: 3500.0,
  });
  await upsertDemoClass(tutorId, {
    subject: 'Physics - Form 5',
    subjectArea: 'Physics',
    description: 'Advanced mechanics, electromagnetic waves, and thermal dynamics.',
    level: 'Form 5',
    venue: 'Classroom B',
    dayOfWeek: 'Tuesday',
    startTime: '16:00:00',
    endTime: '17:30:00',
    capacity: 25,
    fee: 4000.0,
  });

  console.log('\n[seed] Done! You can log in with:');
  console.log(`  Tutor   -> tutor@brilliant.test   / ${DEMO_PASSWORD}`);
  console.log(`  Student -> student@brilliant.test / ${DEMO_PASSWORD}`);
  process.exit(0);
}

run().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
