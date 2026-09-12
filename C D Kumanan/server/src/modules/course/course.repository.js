// All the SQL for the Course Management module lives here, and nowhere
// else. Every query uses "?" placeholders - never string concatenation.
const { pool } = require('../../../../../shared/server/src/config/db');

const ACTIVE_CLASS_WITH_TUTOR_SELECT = `
  SELECT c.*, t.full_name AS tutor_name, t.profile_picture_path AS tutor_profile_picture,
         (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled_count
  FROM classes c
  JOIN users t ON t.id = c.tutor_id
`;

async function listActiveClasses({ search, subjectArea, level, dayOfWeek }) {
  const clauses = [`c.status = 'ACTIVE'`];
  const params = [];

  if (search) {
    clauses.push('(c.subject LIKE ? OR t.full_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (subjectArea) {
    clauses.push('c.subject_area = ?');
    params.push(subjectArea);
  }
  if (level) {
    clauses.push('c.level = ?');
    params.push(level);
  }
  if (dayOfWeek) {
    clauses.push('c.day_of_week = ?');
    params.push(dayOfWeek);
  }

  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC`,
    params
  );
  return rows;
}

// --- Tutor profile (view a tutor's public info + the classes they teach) ---

async function findTutorProfile(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, bio, profile_picture_path, created_at FROM users WHERE id = ? AND role = 'TUTOR' AND status != 'DELETED' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

// Every active Tutor, for Admin's "assign a tutor to this class" picker -
// search-by-name or just scroll the list.
async function listAllTutors() {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, profile_picture_path
     FROM users
     WHERE role = 'TUTOR' AND status = 'ACTIVE'
     ORDER BY full_name ASC`
  );
  return rows;
}

async function findActiveTutorById(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? AND role = 'TUTOR' AND status = 'ACTIVE' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

async function listActiveClassesByTutor(tutorId) {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE c.status = 'ACTIVE' AND c.tutor_id = ? ORDER BY c.created_at DESC`,
    [tutorId]
  );
  return rows;
}

async function findClassWithTutorAndCount(classId) {
  const [rows] = await pool.execute(`${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE c.id = ? LIMIT 1`, [
    classId,
  ]);
  return rows[0] || null;
}

async function findClassById(classId) {
  const [rows] = await pool.execute(`SELECT * FROM classes WHERE id = ? LIMIT 1`, [classId]);
  return rows[0] || null;
}

async function listClassesByTutor(tutorId) {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE c.tutor_id = ? AND c.status != 'CANCELLED' ORDER BY c.created_at DESC`,
    [tutorId]
  );
  return rows;
}

// Admin's "Manage Classes" view - every class regardless of which Tutor it
// belongs to, since an Admin doesn't teach and so is never `tutor_id` on
// any row itself.
async function listAllClasses() {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE c.status != 'CANCELLED' ORDER BY c.created_at DESC`
  );
  return rows;
}

async function createClass(data) {
  const [result] = await pool.execute(
    `INSERT INTO classes
       (subject, subject_area, description, level, tutor_id, venue, day_of_week,
        start_time, end_time, capacity, fee, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
    [
      data.subject,
      data.subjectArea,
      data.description || null,
      data.level || null,
      data.tutorId,
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

async function updateClass(classId, data) {
  await pool.execute(
    `UPDATE classes
     SET subject = ?, subject_area = ?, description = ?, level = ?, venue = ?, day_of_week = ?,
         start_time = ?, end_time = ?, capacity = ?, fee = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      data.subject,
      data.subjectArea,
      data.description || null,
      data.level || null,
      data.venue,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      data.capacity,
      data.fee,
      classId,
    ]
  );
}

async function cancelClass(classId) {
  await pool.execute(`UPDATE classes SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?`, [
    classId,
  ]);
}

// CRS-05 hard block: another ACTIVE class already booked at the same
// venue, on the same day, with an overlapping time range.
async function findConflictingVenueClass({ venue, dayOfWeek, startTime, endTime, excludeClassId }) {
  const [rows] = await pool.execute(
    `SELECT id, subject, start_time, end_time FROM classes
     WHERE status = 'ACTIVE' AND venue = ? AND day_of_week = ?
       AND start_time < ? AND end_time > ?
       AND id != ?
     LIMIT 1`,
    [venue, dayOfWeek, endTime, startTime, excludeClassId || 0]
  );
  return rows[0] || null;
}

async function findConflictingTutorClass({ tutorId, dayOfWeek, startTime, endTime, excludeClassId }) {
  const [rows] = await pool.execute(
    `SELECT id, subject, venue, start_time, end_time FROM classes
     WHERE status = 'ACTIVE' AND tutor_id = ? AND day_of_week = ?
       AND start_time < ? AND end_time > ?
       AND id != ?
     LIMIT 1`,
    [tutorId, dayOfWeek, endTime, startTime, excludeClassId || 0]
  );
  return rows[0] || null;
}

async function findEnrollment(studentId, classId) {
  const [rows] = await pool.execute(
    `SELECT * FROM enrollments WHERE student_id = ? AND class_id = ? LIMIT 1`,
    [studentId, classId]
  );
  return rows[0] || null;
}

async function createEnrollment(studentId, classId, balance) {
  const [result] = await pool.execute(
    `INSERT INTO enrollments (student_id, class_id, status, balance, enrolled_at)
     VALUES (?, ?, 'ACTIVE', ?, NOW())`,
    [studentId, classId, balance]
  );
  return result.insertId;
}

async function reactivateEnrollment(enrollmentId, balance) {
  await pool.execute(
    `UPDATE enrollments SET status = 'ACTIVE', balance = ?, enrolled_at = NOW(), drop_date = NULL
     WHERE id = ?`,
    [balance, enrollmentId]
  );
}

async function dropEnrollment(enrollmentId) {
  await pool.execute(
    `UPDATE enrollments SET status = 'DROPPED', drop_date = NOW() WHERE id = ?`,
    [enrollmentId]
  );
}

async function countActiveEnrollments(classId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM enrollments WHERE class_id = ? AND status = 'ACTIVE'`,
    [classId]
  );
  return Number(rows[0].total);
}

async function listMyEnrollments(studentId) {
  const [rows] = await pool.execute(
    `SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.balance, e.enrolled_at, e.drop_date,
            c.id, c.subject, c.subject_area, c.level, c.venue, c.day_of_week, c.start_time, c.end_time,
            c.status, t.full_name AS tutor_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users t ON t.id = c.tutor_id
     WHERE e.student_id = ?
     ORDER BY e.enrolled_at DESC`,
    [studentId]
  );
  return rows;
}

module.exports = {
  listActiveClasses,
  findTutorProfile,
  listAllTutors,
  findActiveTutorById,
  listActiveClassesByTutor,
  findClassWithTutorAndCount,
  findClassById,
  listClassesByTutor,
  listAllClasses,
  createClass,
  updateClass,
  cancelClass,
  findConflictingVenueClass,
  findConflictingTutorClass,
  findEnrollment,
  createEnrollment,
  reactivateEnrollment,
  dropEnrollment,
  countActiveEnrollments,
  listMyEnrollments,
};
