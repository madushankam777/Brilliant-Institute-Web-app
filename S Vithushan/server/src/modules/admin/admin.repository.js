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
    clauses.push('(full_name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
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

// delete btn - soft delete only: history (classes taught, payments, audit log
// entries) references this row, so it stays and just drops out of every
// active listing instead of being physically removed.
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
     WHERE u.status != 'DELETED'
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

async function revokeTutorKey(keyId) {
  await pool.execute(`UPDATE tutor_enrollment_keys SET status = 'REVOKED' WHERE id = ?`, [keyId]);
}

// delete btn - remove key record
async function deleteTutorKey(keyId) {
  await pool.execute(`DELETE FROM tutor_enrollment_keys WHERE id = ?`, [keyId]);
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

// filter announcements by role + grade
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

// notification bell - personal reminders sent to this user
async function listNotificationsForUser(userId, limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 30;
  const [rows] = await pool.query(
    `SELECT id, type, message, sent_at
     FROM notification_log
     WHERE recipient_id = ?
     ORDER BY sent_at DESC
     LIMIT ${safeLimit}`,
    [userId]
  );
  return rows;
}

module.exports = {
  getCoreCounts,
  getRevenueTrend,
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
