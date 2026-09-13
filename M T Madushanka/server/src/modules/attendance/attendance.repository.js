const { pool } = require('../../../../../shared/server/src/config/db');

const CLASS_WITH_TUTOR_SELECT = `
  SELECT c.*, t.full_name AS tutor_name, t.profile_picture_path AS tutor_profile_picture
  FROM classes c
  JOIN users t ON t.id = c.tutor_id
`;

async function findClassById(classId) {
  const [rows] = await pool.execute(`SELECT * FROM classes WHERE id = ? LIMIT 1`, [classId]);
  return rows[0] || null;
}

// class picker list - a tutor's own classes
async function listClassesByTutor(tutorId) {
  const [rows] = await pool.execute(
    `${CLASS_WITH_TUTOR_SELECT} WHERE c.tutor_id = ? AND c.status != 'CANCELLED' ORDER BY c.created_at DESC`,
    [tutorId]
  );
  return rows;
}

// class picker list - every class, for admin
async function listAllClassesWithTutor() {
  const [rows] = await pool.execute(
    `${CLASS_WITH_TUTOR_SELECT} WHERE c.status != 'CANCELLED' ORDER BY c.created_at DESC`
  );
  return rows;
}

async function findSessionWithClass(sessionId) {
  const [rows] = await pool.execute(
    `SELECT cs.id, cs.class_id, cs.session_date, cs.start_time, cs.end_time,
            c.subject, c.tutor_id, c.level
     FROM class_sessions cs
     JOIN classes c ON c.id = cs.class_id
     WHERE cs.id = ?
     LIMIT 1`,
    [sessionId]
  );
  return rows[0] || null;
}

async function listSessionsForClass(classId) {
  const [rows] = await pool.execute(
    `SELECT id, class_id, session_date, start_time, end_time
     FROM class_sessions
     WHERE class_id = ?
     ORDER BY session_date DESC, start_time DESC`,
    [classId]
  );
  return rows;
}

// every actively-enrolled student shows up on the attendance sheet -
// attendance and fee payment are tracked separately, so an outstanding
// balance should never block a tutor from recording who was in class.
async function listActiveStudentsForClass(classId) {
  const [rows] = await pool.execute(
    `SELECT u.id AS student_id, u.full_name AS student_name, u.student_code,
            u.profile_picture_path
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.class_id = ? AND e.status = 'ACTIVE'
     ORDER BY u.full_name ASC`,
    [classId]
  );
  return rows;
}

async function findSessionByClassAndDate(classId, sessionDate) {
  const [rows] = await pool.execute(
    `SELECT id, class_id, session_date, start_time, end_time
     FROM class_sessions WHERE class_id = ? AND session_date = ? LIMIT 1`,
    [classId, sessionDate]
  );
  return rows[0] || null;
}

async function createSession({ classId, sessionDate, startTime, endTime }) {
  const [result] = await pool.execute(
    `INSERT INTO class_sessions (class_id, session_date, start_time, end_time, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [classId, sessionDate, startTime, endTime]
  );
  return result.insertId;
}

async function listAttendanceForSession(sessionId) {
  const [rows] = await pool.execute(
    `SELECT id, session_id, student_id, status, remarks, marked_by, marked_at, updated_at
     FROM attendance_records
     WHERE session_id = ?`,
    [sessionId]
  );
  return rows;
}

async function findAttendanceRecord(sessionId, studentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? LIMIT 1`,
    [sessionId, studentId]
  );
  return rows[0] || null;
}

async function createAttendanceRecord({ sessionId, studentId, status, remarks, markedBy }) {
  await pool.execute(
    `INSERT INTO attendance_records
       (session_id, student_id, status, remarks, marked_by, marked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [sessionId, studentId, status, remarks || null, markedBy]
  );
}

async function updateAttendanceRecord(id, { status, remarks, markedBy }) {
  await pool.execute(
    `UPDATE attendance_records
     SET status = ?, remarks = ?, marked_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, remarks || null, markedBy, id]
  );
}

async function listAttendanceHistoryForStudent(studentId, classId) {
  const params = [studentId];
  let classFilter = '';
  if (classId) {
    classFilter = 'AND cs.class_id = ?';
    params.push(classId);
  }

  const [rows] = await pool.execute(
    `SELECT ar.id, ar.session_id, ar.status, ar.remarks, ar.marked_at, ar.updated_at,
            cs.session_date, cs.class_id, c.subject
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     WHERE ar.student_id = ? ${classFilter}
     ORDER BY cs.session_date DESC`,
    params
  );
  return rows;
}

async function isStudentEnrolledInClass(studentId, classId) {
  const [rows] = await pool.execute(
    `SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [studentId, classId]
  );
  return rows.length > 0;
}

async function getAttendanceSummaryByClass(studentId) {
  const [rows] = await pool.execute(
    `SELECT cs.class_id, c.subject,
            COUNT(*) AS total_sessions,
            SUM(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended_sessions
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     WHERE ar.student_id = ?
     GROUP BY cs.class_id, c.subject`,
    [studentId]
  );
  return rows;
}

module.exports = {
  findClassById,
  listClassesByTutor,
  listAllClassesWithTutor,
  findSessionWithClass,
  listSessionsForClass,
  findSessionByClassAndDate,
  createSession,
  listActiveStudentsForClass,
  listAttendanceForSession,
  findAttendanceRecord,
  createAttendanceRecord,
  updateAttendanceRecord,
  listAttendanceHistoryForStudent,
  isStudentEnrolledInClass,
  getAttendanceSummaryByClass,
};
