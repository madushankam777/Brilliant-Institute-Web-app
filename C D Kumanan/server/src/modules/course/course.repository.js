// Course module - all database queries
const { pool } = require('../../../../../shared/server/src/config/db');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');

const ACTIVE_CLASS_WITH_TUTOR_SELECT = `
  SELECT c.*, t.full_name AS tutor_name, t.profile_picture_path AS tutor_profile_picture,
         (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled_count
  FROM classes c
  JOIN users t ON t.id = c.tutor_id
`;

const WEEK_ORDER = `FIELD(c.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')`;

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

// list every class, for admin
async function listAllClasses() {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT} WHERE c.status != 'CANCELLED' ORDER BY c.created_at DESC`
  );
  return rows;
}

async function createClass(data) {
  // start_date only exists once the database update has been run
  if (await schema.hasClassStartDate()) {
    const [result] = await pool.execute(
      `INSERT INTO classes
         (subject, subject_area, description, level, tutor_id, venue, day_of_week,
          start_time, end_time, start_date, capacity, fee, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
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
        data.startDate || null,
        data.capacity,
        data.fee,
      ]
    );
    return result.insertId;
  }

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

// everyone who should be told when this class changes
async function listActiveStudentIdsForClass(classId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT e.student_id
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.class_id = ? AND e.status = 'ACTIVE' AND u.status = 'ACTIVE'`,
    [classId]
  );
  return rows.map((row) => row.student_id);
}

async function createNotification({ recipientId, type, message, sentBy }) {
  await pool.execute(
    `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
     VALUES (?, 'EMAIL', ?, ?, ?, NOW())`,
    [recipientId, type, message, sentBy || null]
  );
}

async function cancelClass(classId) {
  await pool.execute(`UPDATE classes SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?`, [
    classId,
  ]);
}

// check venue/time clash
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
    `SELECT c.id, c.subject, c.venue, c.start_time, c.end_time, t.full_name AS tutor_name
     FROM classes c
     JOIN users t ON t.id = c.tutor_id
     WHERE c.status = 'ACTIVE' AND c.tutor_id = ? AND c.day_of_week = ?
       AND c.start_time < ? AND c.end_time > ?
       AND c.id != ?
     LIMIT 1`,
    [tutorId, dayOfWeek, endTime, startTime, excludeClassId || 0]
  );
  return rows[0] || null;
}

// About page - tutors who teach an active class (no email or phone)
async function listPublicTutors() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.profile_picture_path, u.bio,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR '|') AS subjects
     FROM users u
     JOIN classes c ON c.tutor_id = u.id AND c.status = 'ACTIVE'
     WHERE u.role = 'TUTOR' AND u.status = 'ACTIVE'
     GROUP BY u.id, u.full_name, u.profile_picture_path, u.bio
     ORDER BY u.full_name`
  );
  return rows;
}

// --- Cancelled days and extra classes (class_events) ---

const EVENT_SELECT = `
  SELECT ev.id, ev.class_id, ev.event_date, ev.type, ev.start_time, ev.end_time, ev.venue, ev.note,
         ev.created_at, c.subject, c.level, c.tutor_id, c.venue AS class_venue,
         c.start_time AS class_start_time, c.end_time AS class_end_time,
         t.full_name AS tutor_name, u.full_name AS created_by_name
  FROM class_events ev
  JOIN classes c ON c.id = ev.class_id
  JOIN users t ON t.id = c.tutor_id
  JOIN users u ON u.id = ev.created_by
`;

// studentId narrows the list to classes that student attends
async function listClassEvents({ fromDate, toDate, studentId }) {
  const params = [];
  let join = '';
  if (studentId) {
    join = `JOIN enrollments en ON en.class_id = c.id AND en.student_id = ? AND en.status = 'ACTIVE'`;
    params.push(studentId);
  }
  params.push(fromDate, toDate);
  const [rows] = await pool.execute(
    `${EVENT_SELECT} ${join}
     WHERE ev.event_date BETWEEN ? AND ? AND c.status = 'ACTIVE'
     ORDER BY ev.event_date, COALESCE(ev.start_time, c.start_time)`,
    params
  );
  return rows;
}

async function findClassEvent(eventId) {
  const [rows] = await pool.execute(`${EVENT_SELECT} WHERE ev.id = ? LIMIT 1`, [eventId]);
  return rows[0] || null;
}

async function findCancelledDay(classId, eventDate) {
  const [rows] = await pool.execute(
    `SELECT id FROM class_events WHERE class_id = ? AND event_date = ? AND type = 'CANCELLED' LIMIT 1`,
    [classId, eventDate]
  );
  return rows[0] || null;
}

async function createClassEvent({ classId, eventDate, type, startTime, endTime, venue, note, createdBy }) {
  const [result] = await pool.execute(
    `INSERT INTO class_events (class_id, event_date, type, start_time, end_time, venue, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [classId, eventDate, type, startTime || null, endTime || null, venue || null, note || null, createdBy]
  );
  return result.insertId;
}

async function deleteClassEvent(eventId) {
  await pool.execute(`DELETE FROM class_events WHERE id = ?`, [eventId]);
}

// a weekly class using the same room or tutor at that time
async function findBusyWeeklyClass({ eventDate, dayOfWeek, startTime, endTime, venue, tutorId }) {
  const [rows] = await pool.execute(
    `SELECT c.subject, c.venue, c.start_time, c.end_time, c.tutor_id, t.full_name AS tutor_name
     FROM classes c
     JOIN users t ON t.id = c.tutor_id
     WHERE c.status = 'ACTIVE' AND c.day_of_week = ?
       AND c.start_time < ? AND c.end_time > ?
       AND (c.venue = ? OR c.tutor_id = ?)
       AND NOT EXISTS (
         SELECT 1 FROM class_events x
         WHERE x.class_id = c.id AND x.event_date = ? AND x.type = 'CANCELLED'
       )
     LIMIT 1`,
    [dayOfWeek, endTime, startTime, venue, tutorId, eventDate]
  );
  return rows[0] || null;
}

// An extra class already booked at that time, in the same room or with the same tutor.
async function findBusyExtraClass({ eventDate, startTime, endTime, venue, tutorId }) {
  const [rows] = await pool.execute(
    `SELECT c.subject, ev.venue, ev.start_time, ev.end_time, c.tutor_id, t.full_name AS tutor_name
     FROM class_events ev
     JOIN classes c ON c.id = ev.class_id
     JOIN users t ON t.id = c.tutor_id
     WHERE ev.type = 'EXTRA' AND ev.event_date = ?
       AND ev.start_time < ? AND ev.end_time > ?
       AND (ev.venue = ? OR c.tutor_id = ?)
     LIMIT 1`,
    [eventDate, endTime, startTime, venue, tutorId]
  );
  return rows[0] || null;
}

// --- Timetables ---

async function findPersonForTimetable(userId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, role, grade FROM users WHERE id = ? AND status != 'DELETED' LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function listTimetableForTutor(tutorId) {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT}
     WHERE c.status = 'ACTIVE' AND c.tutor_id = ?
     ORDER BY ${WEEK_ORDER}, c.start_time`,
    [tutorId]
  );
  return rows;
}

async function listTimetableForStudent(studentId) {
  const [rows] = await pool.execute(
    `${ACTIVE_CLASS_WITH_TUTOR_SELECT}
     JOIN enrollments en ON en.class_id = c.id AND en.student_id = ? AND en.status = 'ACTIVE'
     WHERE c.status = 'ACTIVE'
     ORDER BY ${WEEK_ORDER}, c.start_time`,
    [studentId]
  );
  return rows;
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

// re-add a dropped class (reset balance and payment status)
async function reactivateEnrollment(enrollmentId, balance) {
  await pool.execute(
    `UPDATE enrollments
     SET status = 'ACTIVE', balance = ?, payment_status = 'UNPAID', enrolled_at = NOW(), drop_date = NULL
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

// delete btn - just hide it, keep payment history safe
async function removeEnrollmentRecord(enrollmentId) {
  await pool.execute(`UPDATE enrollments SET status = 'REMOVED' WHERE id = ?`, [enrollmentId]);
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
     WHERE e.student_id = ? AND e.status != 'REMOVED'
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
  listActiveStudentIdsForClass,
  createNotification,
  findConflictingVenueClass,
  findConflictingTutorClass,
  listPublicTutors,
  listClassEvents,
  findClassEvent,
  findCancelledDay,
  createClassEvent,
  deleteClassEvent,
  findBusyWeeklyClass,
  findBusyExtraClass,
  findPersonForTimetable,
  listTimetableForTutor,
  listTimetableForStudent,
  findEnrollment,
  createEnrollment,
  reactivateEnrollment,
  dropEnrollment,
  removeEnrollmentRecord,
  countActiveEnrollments,
  listMyEnrollments,
};
