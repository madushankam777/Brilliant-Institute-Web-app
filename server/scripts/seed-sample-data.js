// Adds sample tutors (with bank details), students across every grade,
// classes, enrolments and a few past payouts, so every admin page has
// something to show. Safe to run again - anything already there is skipped.
// Every sample account uses the password Demo@1234.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const config = require('../../shared/server/src/config/env');
const { pool } = require('../../shared/server/src/config/db');

const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@1234';

const TUTORS = [
  {
    email: 'tutor@brilliant.test',
    fullName: 'Demo Tutor',
    bank: ['Commercial Bank', 'Demo Tutor', '8001234567', 'Colombo 07'],
  },
  {
    email: 'nimal.perera@brilliant.test',
    fullName: 'Nimal Perera',
    phone: '+94 71 234 5678',
    bio: 'Physics tutor with 12 years of A/L experience.',
    bank: ['Bank of Ceylon', 'N. Perera', '0074561239', 'Kandy'],
  },
  {
    email: 'kavindi.silva@brilliant.test',
    fullName: 'Kavindi Silva',
    phone: '+94 77 345 6789',
    bio: 'English and Literature for Grades 6-11.',
    bank: ['Hatton National Bank', 'K. Silva', '1122334455', 'Nugegoda'],
  },
];

const STUDENTS = [
  { email: 'student@brilliant.test', fullName: 'Demo Student', grade: 'Grade 10' },
  { email: 'amaya.fernando@brilliant.test', fullName: 'Amaya Fernando', grade: 'Grade 6', phone: '+94 70 111 2233' },
  { email: 'dinuk.jayasinghe@brilliant.test', fullName: 'Dinuk Jayasinghe', grade: 'Grade 8', phone: '+94 71 222 3344' },
  { email: 'sithmi.rathnayake@brilliant.test', fullName: 'Sithmi Rathnayake', grade: 'Grade 9', phone: '+94 72 333 4455' },
  { email: 'ravindu.bandara@brilliant.test', fullName: 'Ravindu Bandara', grade: 'Grade 10', phone: '+94 75 444 5566' },
  { email: 'tharushi.wickrama@brilliant.test', fullName: 'Tharushi Wickramasinghe', grade: 'Grade 11', phone: '+94 76 555 6677' },
  { email: 'pasindu.gamage@brilliant.test', fullName: 'Pasindu Gamage', grade: 'A/L', phone: '+94 77 666 7788' },
];

const CLASSES = [
  { tutor: 'nimal.perera@brilliant.test', subject: 'A/L Physics - Theory', area: 'Physics', level: 'A/L',
    venue: 'Hall B', day: 'Sunday', start: '08:00', end: '11:00', fee: 4500, students: ['pasindu.gamage@brilliant.test'] },
  { tutor: 'kavindi.silva@brilliant.test', subject: 'English Language - Grade 10/11', area: 'English', level: 'Grade 10',
    venue: 'Room 3', day: 'Wednesday', start: '15:30', end: '17:30', fee: 2500,
    students: ['student@brilliant.test', 'ravindu.bandara@brilliant.test', 'tharushi.wickrama@brilliant.test'] },
  { tutor: 'kavindi.silva@brilliant.test', subject: 'English Foundation - Grade 6-9', area: 'English', level: 'Grade 8',
    venue: 'Room 3', day: 'Friday', start: '15:30', end: '17:00', fee: 2000,
    students: ['amaya.fernando@brilliant.test', 'dinuk.jayasinghe@brilliant.test', 'sithmi.rathnayake@brilliant.test'] },
];

const PAYOUTS = [
  { tutor: 'nimal.perera@brilliant.test', amount: 36000, period: 'August 2026', note: 'Monthly class fees share' },
  { tutor: 'kavindi.silva@brilliant.test', amount: 28500, period: 'August 2026', note: 'Monthly class fees share' },
];

let added = 0;

async function idByEmail(email) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  return rows[0] ? rows[0].id : null;
}

async function ensureUser({ email, fullName, role, phone, bio, grade }) {
  const existing = await idByEmail(email);
  if (existing) return existing;
  const hash = await bcrypt.hash(PASSWORD, config.auth.bcryptSaltRounds);
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, phone, role, status, bio, grade, created_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NOW())`,
    [fullName, email, hash, phone || null, role, bio || null, grade || null]
  );
  added += 1;
  return result.insertId;
}

async function main() {
  const [admins] = await pool.execute("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1");
  const adminId = admins[0] ? admins[0].id : null;

  for (const tutor of TUTORS) {
    const id = await ensureUser({ ...tutor, role: 'TUTOR' });
    // only fill bank details that are missing - never overwrite real ones
    await pool.execute(
      `UPDATE users SET bank_name = ?, bank_account_holder = ?, bank_account_number = ?, bank_branch = ?
       WHERE id = ? AND bank_account_number IS NULL`,
      [...tutor.bank, id]
    );
  }

  for (const student of STUDENTS) {
    const id = await ensureUser({ ...student, role: 'STUDENT_PARENT' });
    await pool.execute(
      `UPDATE users SET grade = COALESCE(grade, ?),
              student_code = COALESCE(student_code, CONCAT('ST', LPAD(id, 7, '0')))
       WHERE id = ?`,
      [student.grade, id]
    );
  }

  for (const c of CLASSES) {
    const tutorId = await idByEmail(c.tutor);
    const [existing] = await pool.execute('SELECT id FROM classes WHERE subject = ? AND tutor_id = ?', [c.subject, tutorId]);
    let classId = existing[0] ? existing[0].id : null;
    if (!classId) {
      const [result] = await pool.execute(
        `INSERT INTO classes (subject, subject_area, level, tutor_id, venue, day_of_week, start_time, end_time, capacity, fee, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 30, ?, 'ACTIVE', NOW())`,
        [c.subject, c.area, c.level, tutorId, c.venue, c.day, c.start, c.end, c.fee]
      );
      classId = result.insertId;
      added += 1;
    }
    for (const email of c.students) {
      const studentId = await idByEmail(email);
      const [enrolled] = await pool.execute(
        'SELECT id FROM enrollments WHERE student_id = ? AND class_id = ?',
        [studentId, classId]
      );
      if (!enrolled[0]) {
        await pool.execute(
          `INSERT INTO enrollments (student_id, class_id, status, balance, enrolled_at)
           VALUES (?, ?, 'ACTIVE', ?, NOW())`,
          [studentId, classId, c.fee]
        );
        added += 1;
      }
    }
  }

  if (adminId) {
    for (const p of PAYOUTS) {
      const tutorId = await idByEmail(p.tutor);
      const [existing] = await pool.execute(
        'SELECT id FROM tutor_payouts WHERE tutor_id = ? AND period_label = ?',
        [tutorId, p.period]
      );
      if (!existing[0]) {
        await pool.execute(
          `INSERT INTO tutor_payouts (tutor_id, amount, note, period_label, paid_by, paid_at)
           VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 20 DAY))`,
          [tutorId, p.amount, p.note, p.period, adminId]
        );
        added += 1;
      }
    }
  }

  console.log(`Sample data ready (${added} new row(s)). Every sample account's password: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
