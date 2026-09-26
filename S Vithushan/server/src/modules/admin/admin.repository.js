// Admin module - all database queries
const { pool } = require('../../../../../shared/server/src/config/db');

// --- Dashboard -----------------------------------------------------------

async function getCoreCounts() {
  const [[userRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users WHERE status != 'DELETED'`
  );
  const [[classRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM classes WHERE status = 'ACTIVE'`
  );
  const [[complaintRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM feedback_complaints WHERE status != 'RESOLVED'`
  );
  const [[revenueRow]] = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE status = 'SUCCESSFUL' AND MONTH(paid_at) = MONTH(CURDATE()) AND YEAR(paid_at) = YEAR(CURDATE())`
  );
  return {
    totalUsers: Number(userRow.total),
    activeClasses: Number(classRow.total),
    openComplaints: Number(complaintRow.total),
    monthlyRevenue: Number(revenueRow.total),
  };
}

async function getRevenueTrend() {
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(amount) AS total
     FROM payments
     WHERE status = 'SUCCESSFUL' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
     GROUP BY month
     ORDER BY month ASC`
  );
  return rows.map((row) => ({ month: row.month, total: Number(row.total) }));
}

// --- Revenue report ---

async function getDatabaseToday() {
  const [[row]] = await pool.query('SELECT CURDATE() AS today');
  return row.today;
}

// Formats come from this fixed list, never from the request.
const REVENUE_BUCKET_FORMATS = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

async function sumRevenueByBucket(bucket, fromDate, toDate) {
  const format = REVENUE_BUCKET_FORMATS[bucket];
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(paid_at, '${format}') AS bucket, SUM(amount) AS total, COUNT(*) AS payment_count
     FROM payments
     WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY bucket`,
    [fromDate, toDate]
  );
  return rows;
}

async function listRecentActivity(limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            u.full_name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit}`
  );
  return rows;
}

// --- Users -----------------------------------------------------------------

async function listUsers({ search, role, status }) {
  const clauses = [`status != 'DELETED'`];
  const params = [];

  if (search) {
    clauses.push('(full_name LIKE ? OR email LIKE ? OR student_code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (role) {
    clauses.push('role = ?');
    params.push(role);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }

  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return rows;
}

async function createUser({ fullName, email, passwordHash, role }) {
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', NOW())`,
    [fullName, email, passwordHash, role]
  );
  return result.insertId;
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

async function findUserById(userId) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE id = ? LIMIT 1`, [userId]);
  return rows[0] || null;
}

async function updateUserStatus(userId, status) {
  await pool.execute(`UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?`, [
    status,
    userId,
  ]);
}

// delete btn - soft delete only
async function softDeleteUser(userId) {
  await pool.execute(`UPDATE users SET status = 'DELETED', updated_at = NOW() WHERE id = ?`, [
    userId,
  ]);
}

async function isStudentEnrolledWithTutor(studentId, tutorId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.student_id = ? AND c.tutor_id = ? AND e.status = 'ACTIVE'
     LIMIT 1`,
    [studentId, tutorId]
  );
  return rows.length > 0;
}

async function listStudentsForTutor(tutorId) {
  const [rows] = await pool.execute(
    `SELECT u.*,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR ', ') AS class_names
     FROM users u
     JOIN enrollments e ON e.student_id = u.id AND e.status = 'ACTIVE'
     JOIN classes c ON c.id = e.class_id AND c.tutor_id = ?
     WHERE u.status NOT IN ('DELETED', 'LEFT')
     GROUP BY u.id
     ORDER BY u.full_name ASC`,
    [tutorId]
  );
  return rows;
}

// --- Tutor enrollment keys ---------------------------------------------------

async function createTutorKey({ keyCode, intendedFor, idNumber, cvPath, certificatePaths, createdBy }) {
  const [result] = await pool.execute(
    `INSERT INTO tutor_enrollment_keys
       (key_code, intended_for, id_number, cv_path, certificate_paths, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'UNUSED', ?, NOW())`,
    [
      keyCode,
      intendedFor || null,
      idNumber || null,
      cvPath || null,
      JSON.stringify(certificatePaths || []),
      createdBy,
    ]
  );
  return result.insertId;
}

async function listTutorKeys() {
  const [rows] = await pool.execute(
    `SELECT k.*, creator.full_name AS created_by_name, user.full_name AS used_by_name
     FROM tutor_enrollment_keys k
     JOIN users creator ON creator.id = k.created_by
     LEFT JOIN users user ON user.id = k.used_by
     ORDER BY k.created_at DESC`
  );
  return rows;
}

async function findTutorKeyById(keyId) {
  const [rows] = await pool.execute(`SELECT * FROM tutor_enrollment_keys WHERE id = ? LIMIT 1`, [
    keyId,
  ]);
  return rows[0] || null;
}

// admin viewing a tutor: the key they redeemed carries their CV/certificates
async function findTutorKeyByUserId(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM tutor_enrollment_keys WHERE used_by = ? ORDER BY used_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function revokeTutorKey(keyId) {
  await pool.execute(`UPDATE tutor_enrollment_keys SET status = 'REVOKED' WHERE id = ?`, [keyId]);
}

// delete btn - remove key record
async function deleteTutorKey(keyId) {
  await pool.execute(`DELETE FROM tutor_enrollment_keys WHERE id = ?`, [keyId]);
}

async function listAdminIds() {
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`
  );
  return rows.map((row) => row.id);
}

// students a tutor may message
async function listStudentIdsForTutor(tutorId, classId) {
  const params = [tutorId];
  let clause = '';
  if (classId) {
    clause = ' AND c.id = ?';
    params.push(classId);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT e.student_id
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = e.student_id
     WHERE c.tutor_id = ? AND e.status = 'ACTIVE' AND u.status = 'ACTIVE'${clause}`,
    params
  );
  return rows.map((row) => row.student_id);
}

async function listClassesForTutor(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, subject, level FROM classes WHERE tutor_id = ? AND status = 'ACTIVE' ORDER BY subject ASC`,
    [tutorId]
  );
  return rows;
}

// --- Student re-registration (yearly grade roll-over) -----------------------

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function placeholdersFor(values) {
  return values.map(() => '?').join(', ');
}

async function createReregistrationKey(
  { keyCode, studentId, fromGrade, toGrade, academicYear, expiresAt, createdBy },
  executor = pool
) {
  const [result] = await executor.execute(
    `INSERT INTO student_reregistration_keys
       (key_code, student_id, from_grade, to_grade, academic_year, status, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'UNUSED', ?, ?, NOW())`,
    [keyCode, studentId, fromGrade || null, toGrade, academicYear, expiresAt || null, createdBy]
  );
  return result.insertId;
}

// Every active student, with the classes they attend (used for search).
async function listStudentsForReregistration() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.email, u.student_code, u.grade,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR ', ') AS class_names
     FROM users u
     LEFT JOIN enrollments e ON e.student_id = u.id AND e.status = 'ACTIVE'
     LEFT JOIN classes c ON c.id = e.class_id AND c.status = 'ACTIVE'
     WHERE u.role = 'STUDENT_PARENT' AND u.status = 'ACTIVE'
     GROUP BY u.id
     ORDER BY u.full_name ASC`
  );
  return rows;
}

async function listClassesWithStudentCounts() {
  const [rows] = await pool.execute(
    `SELECT c.id, c.subject, c.level, t.full_name AS tutor_name, COUNT(u.id) AS student_count
     FROM classes c
     JOIN users t ON t.id = c.tutor_id
     LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ACTIVE'
     LEFT JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE' AND u.role = 'STUDENT_PARENT'
     WHERE c.status = 'ACTIVE'
     GROUP BY c.id, t.full_name
     ORDER BY c.subject ASC`
  );
  return rows;
}

async function listActiveStudentIdsInClass(classId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.class_id = ? AND e.status = 'ACTIVE' AND u.status = 'ACTIVE' AND u.role = 'STUDENT_PARENT'`,
    [classId]
  );
  return rows.map((row) => row.id);
}

async function listActiveStudentIdsInGrade(grade) {
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE grade = ? AND status = 'ACTIVE' AND role = 'STUDENT_PARENT'`,
    [grade]
  );
  return rows.map((row) => row.id);
}

async function listActiveStudentsByIds(studentIds) {
  if (studentIds.length === 0) return [];
  const [rows] = await pool.execute(
    `SELECT id, full_name, student_code, grade FROM users
     WHERE id IN (${placeholdersFor(studentIds)}) AND status = 'ACTIVE' AND role = 'STUDENT_PARENT'
     ORDER BY full_name ASC`,
    studentIds
  );
  return rows;
}

// Students who already hold a live (unused or used) key for that year.
async function findStudentIdsWithKey(studentIds, academicYear) {
  if (studentIds.length === 0) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT student_id FROM student_reregistration_keys
     WHERE academic_year = ? AND status IN ('UNUSED', 'USED') AND student_id IN (${placeholdersFor(studentIds)})`,
    [academicYear, ...studentIds]
  );
  return rows.map((row) => row.student_id);
}

async function findReregistrationKeyById(keyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_reregistration_keys WHERE id = ? LIMIT 1`,
    [keyId]
  );
  return rows[0] || null;
}

// a key only works for the student it was issued to
async function findRedeemableKeyForStudent(keyCode, studentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM student_reregistration_keys
     WHERE key_code = ? AND student_id = ? AND status = 'UNUSED'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [keyCode, studentId]
  );
  return rows[0] || null;
}

async function markReregistrationKeyUsed(keyId) {
  const [result] = await pool.execute(
    `UPDATE student_reregistration_keys SET status = 'USED', used_at = NOW()
     WHERE id = ? AND status = 'UNUSED'`,
    [keyId]
  );
  return result.affectedRows > 0;
}

async function revokeReregistrationKey(keyId) {
  const [result] = await pool.execute(
    `UPDATE student_reregistration_keys SET status = 'REVOKED' WHERE id = ? AND status = 'UNUSED'`,
    [keyId]
  );
  return result.affectedRows > 0;
}

async function listReregistrationKeys(academicYear) {
  const params = [];
  let clause = '';
  if (academicYear) {
    clause = 'WHERE k.academic_year = ?';
    params.push(academicYear);
  }
  const [rows] = await pool.execute(
    `SELECT k.*, s.full_name AS student_name, s.email AS student_email,
            s.student_code, s.grade AS current_grade, s.status AS student_status,
            a.full_name AS created_by_name,
            (SELECT GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR ', ')
             FROM enrollments e JOIN classes c ON c.id = e.class_id
             WHERE e.student_id = k.student_id AND e.status = 'ACTIVE') AS class_names
     FROM student_reregistration_keys k
     JOIN users s ON s.id = k.student_id
     JOIN users a ON a.id = k.created_by
     ${clause}
     ORDER BY k.created_at DESC
     LIMIT 300`,
    params
  );
  return rows;
}

async function setStudentReregistered(studentId, academicYear) {
  await pool.execute(
    `UPDATE users SET reregistered_for_year = ?, updated_at = NOW()
     WHERE id = ? AND role = 'STUDENT_PARENT'`,
    [academicYear, studentId]
  );
}

async function setStudentGrade(studentId, grade, academicYear) {
  await pool.execute(
    `UPDATE users SET grade = ?, reregistered_for_year = ?, updated_at = NOW()
     WHERE id = ? AND role = 'STUDENT_PARENT'`,
    [grade, academicYear, studentId]
  );
}

// Everyone the roll-over has to decide about
async function listStudentsForRollover(academicYear) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, grade, reregistered_for_year
     FROM users
     WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE'`,
    []
  );
  return rows.map((row) => ({ ...row, hasReregistered: row.reregistered_for_year === academicYear }));
}

async function markStudentLeft(studentId) {
  await pool.execute(
    `UPDATE users SET status = 'LEFT', left_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [studentId]
  );
}

// Leaving the institute ends their enrolments too
async function closeEnrollmentsForStudent(studentId) {
  const [result] = await pool.execute(
    `UPDATE enrollments SET status = 'REMOVED' WHERE student_id = ? AND status = 'ACTIVE'`,
    [studentId]
  );
  return result.affectedRows;
}

async function findRolloverLog(academicYear) {
  const [rows] = await pool.execute(
    `SELECT * FROM yearly_rollover_log WHERE academic_year = ? LIMIT 1`,
    [academicYear]
  );
  return rows[0] || null;
}

async function recordRolloverLog({ academicYear, promotedCount, removedCount, graduatedCount }) {
  await pool.execute(
    `INSERT INTO yearly_rollover_log (academic_year, promoted_count, removed_count, graduated_count, ran_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE promoted_count = VALUES(promoted_count),
                             removed_count = VALUES(removed_count),
                             graduated_count = VALUES(graduated_count),
                             ran_at = VALUES(ran_at)`,
    [academicYear, promotedCount, removedCount, graduatedCount]
  );
}

// --- Announcements -----------------------------------------------------------

async function createAnnouncement({ title, body, priority, targetAudience, targetGrade, publishedBy }) {
  const [result] = await pool.execute(
    `INSERT INTO announcements
       (title, body, priority, target_audience, target_grade, status, published_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'PUBLISHED', ?, NOW())`,
    [title, body, priority || 'NORMAL', targetAudience, targetGrade || null, publishedBy]
  );
  return result.insertId;
}

async function findAnnouncementById(announcementId) {
  const [rows] = await pool.execute(
    `SELECT a.*, u.full_name AS published_by_name, e.full_name AS updated_by_name
     FROM announcements a
     JOIN users u ON u.id = a.published_by
     LEFT JOIN users e ON e.id = a.updated_by
     WHERE a.id = ?
     LIMIT 1`,
    [announcementId]
  );
  return rows[0] || null;
}

async function updateAnnouncement(
  announcementId,
  { title, body, priority, targetAudience, targetGrade, updatedBy }
) {
  await pool.execute(
    `UPDATE announcements
     SET title = ?, body = ?, priority = ?, target_audience = ?, target_grade = ?,
         updated_by = ?, version = version + 1, updated_at = NOW()
     WHERE id = ? AND status != 'ARCHIVED'`,
    [title, body, priority || 'NORMAL', targetAudience, targetGrade || null, updatedBy, announcementId]
  );
}

async function archiveAnnouncement(announcementId, updatedBy) {
  await pool.execute(
    `UPDATE announcements SET status = 'ARCHIVED', updated_by = ?, updated_at = NOW() WHERE id = ?`,
    [updatedBy, announcementId]
  );
}

async function listAllAnnouncements() {
  const [rows] = await pool.execute(
    `SELECT a.*, u.full_name AS published_by_name, e.full_name AS updated_by_name
     FROM announcements a
     JOIN users u ON u.id = a.published_by
     LEFT JOIN users e ON e.id = a.updated_by
     WHERE a.status != 'ARCHIVED'
     ORDER BY a.created_at DESC`
  );
  return rows;
}

async function listAnnouncementsForAudience(role, grade) {
  const [rows] = await pool.execute(
    `SELECT a.*, u.full_name AS published_by_name, e.full_name AS updated_by_name
     FROM announcements a
     JOIN users u ON u.id = a.published_by
     LEFT JOIN users e ON e.id = a.updated_by
     WHERE a.status = 'PUBLISHED' AND (a.target_audience = 'ALL' OR a.target_audience = ?)
       AND (a.target_grade IS NULL OR a.target_grade = ?)
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [role, grade || null]
  );
  return rows;
}

// --- Reminders / Notifications -----------------------------------------------

async function findStudentsWithOverdueFees() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT e.student_id, u.full_name, u.email, e.balance, c.subject
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN classes c ON c.id = e.class_id
     WHERE e.status = 'ACTIVE' AND e.balance > 0`
  );
  return rows;
}

async function findStudentsWithLowAttendance(thresholdPercent) {
  const [rows] = await pool.execute(
    `SELECT ar.student_id, u.full_name, u.email, c.subject,
            COUNT(*) AS total_sessions,
            SUM(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended_sessions
     FROM attendance_records ar
     JOIN users u ON u.id = ar.student_id
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     GROUP BY ar.student_id, c.id, u.full_name, u.email, c.subject
     HAVING total_sessions > 0 AND (attended_sessions / total_sessions) * 100 < ?`,
    [thresholdPercent]
  );
  return rows;
}

async function logNotification({ recipientId, channel, type, message, sentBy }) {
  await pool.execute(
    `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [recipientId, channel, type, message, sentBy || null]
  );
}

// notification bell - only what is due; scheduled reminders wait for their time
async function listNotificationsForUser(userId, limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 30;
  const [rows] = await pool.query(
    `SELECT id, type, message, sent_at
     FROM notification_log
     WHERE recipient_id = ? AND sent_at <= NOW()
     ORDER BY sent_at DESC
     LIMIT ${safeLimit}`,
    [userId]
  );
  return rows;
}

// --- Scheduled reminders (tutor) ---
// One reminder = one notification_log row per recipient, all sharing the same
// message and send time. Rows with a future sent_at stay hidden until then.

async function createScheduledNotifications(recipientIds, { type, message, sentBy, sendAt }) {
  if (recipientIds.length === 0) return;
  const rowsSql = recipientIds.map(() => `(?, 'EMAIL', ?, ?, ?, ?)`).join(', ');
  const params = [];
  recipientIds.forEach((recipientId) => params.push(recipientId, type, message, sentBy, sendAt));
  await pool.execute(
    `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
     VALUES ${rowsSql}`,
    params
  );
}

async function listRemindersByTutor(tutorId, messagePrefix) {
  const [rows] = await pool.execute(
    `SELECT MIN(id) AS id, message, sent_at, COUNT(*) AS recipient_count,
            MAX(sent_at > NOW()) AS is_upcoming, MAX(recipient_id = sent_by) AS is_personal
     FROM notification_log
     WHERE sent_by = ? AND type = 'CLASS_REMINDER' AND message LIKE ?
       AND sent_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
     GROUP BY message, sent_at
     ORDER BY sent_at ASC
     LIMIT 100`,
    [tutorId, `${messagePrefix}%`]
  );
  return rows;
}

async function findReminderRow(reminderId, tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, message, sent_at, sent_at > NOW() AS is_upcoming
     FROM notification_log
     WHERE id = ? AND sent_by = ? AND type = 'CLASS_REMINDER'
     LIMIT 1`,
    [reminderId, tutorId]
  );
  return rows[0] || null;
}

async function countUpcomingReminder({ tutorId, message, sendAt }) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM notification_log
     WHERE sent_by = ? AND type = 'CLASS_REMINDER' AND message = ? AND sent_at = ?`,
    [tutorId, message, sendAt]
  );
  return Number(rows[0].total);
}

// Cancelling removes every copy of the reminder that has not gone out yet.
async function deleteUpcomingReminder({ tutorId, message, sentAt }) {
  const [result] = await pool.execute(
    `DELETE FROM notification_log
     WHERE sent_by = ? AND type = 'CLASS_REMINDER' AND message = ? AND sent_at = ? AND sent_at > NOW()`,
    [tutorId, message, sentAt]
  );
  return result.affectedRows;
}

// role of whoever last suspended this account (from the audit log)
async function findLastSuspenderRole(userId) {
  const [rows] = await pool.execute(
    `SELECT u.role FROM audit_log a
     JOIN users u ON u.id = a.actor_id
     WHERE a.action = 'USER_SUSPENDED' AND a.entity_type = 'user' AND a.entity_id = ?
     ORDER BY a.id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ? rows[0].role : null;
}

module.exports = {
  findLastSuspenderRole,
  getCoreCounts,
  getRevenueTrend,
  getDatabaseToday,
  sumRevenueByBucket,
  withTransaction,
  listStudentsForReregistration,
  listClassesWithStudentCounts,
  listActiveStudentIdsInClass,
  listActiveStudentIdsInGrade,
  listActiveStudentsByIds,
  findStudentIdsWithKey,
  createScheduledNotifications,
  listRemindersByTutor,
  findReminderRow,
  countUpcomingReminder,
  deleteUpcomingReminder,
  listRecentActivity,
  listUsers,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserStatus,
  softDeleteUser,
  isStudentEnrolledWithTutor,
  listStudentsForTutor,
  createTutorKey,
  listTutorKeys,
  findTutorKeyById,
  findTutorKeyByUserId,
  listAdminIds,
  listStudentIdsForTutor,
  listClassesForTutor,
  createReregistrationKey,
  findReregistrationKeyById,
  findRedeemableKeyForStudent,
  markReregistrationKeyUsed,
  revokeReregistrationKey,
  listReregistrationKeys,
  setStudentReregistered,
  setStudentGrade,
  listStudentsForRollover,
  markStudentLeft,
  closeEnrollmentsForStudent,
  findRolloverLog,
  recordRolloverLog,
  revokeTutorKey,
  deleteTutorKey,
  createAnnouncement,
  findAnnouncementById,
  updateAnnouncement,
  archiveAnnouncement,
  listAllAnnouncements,
  listAnnouncementsForAudience,
  findStudentsWithOverdueFees,
  findStudentsWithLowAttendance,
  logNotification,
  listNotificationsForUser,
};
