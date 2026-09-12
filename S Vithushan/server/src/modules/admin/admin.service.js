// Admin module - business logic
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const {
  toSafeUserForAdmin,
  toSafeAnnouncement,
  toSafeTutorKey,
  toSafeNotification,
} = require('../../../../../shared/server/src/utils/sanitize');
const { USER_STATUS, ROLES } = require('../../../../../shared/server/src/config/roles');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const gateway = require('./notificationGateway');
const repository = require('./admin.repository');

async function createUser(adminUser, { fullName, email, password, role }) {
  const existing = await repository.findUserByEmail(email);
  if (existing) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
  const userId = await repository.createUser({ fullName, email, passwordHash, role });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'USER_CREATED_BY_ADMIN',
    entityType: 'user',
    entityId: userId,
    details: { role },
  });

  const created = await repository.findUserById(userId);
  return toSafeUserForAdmin(created);
}

// make a tutor enrollment key code
function generateKeyCode() {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TUT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function generateTutorKey(adminUser, { intendedFor, idNumber, cvPath, certificatePaths }) {
  const keyCode = generateKeyCode();
  const keyId = await repository.createTutorKey({
    keyCode,
    intendedFor,
    idNumber,
    cvPath,
    certificatePaths,
    createdBy: adminUser.id,
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_KEY_GENERATED',
    entityType: 'tutor_enrollment_key',
    entityId: keyId,
    details: { intendedFor: intendedFor || null, idNumber: idNumber || null },
  });

  const created = await repository.findTutorKeyById(keyId);
  return toSafeTutorKey(created, { includeCode: true });
}

async function getTutorKeyDocumentPath(keyId, type, index) {
  const key = await repository.findTutorKeyById(keyId);
  if (!key) {
    throw ApiError.notFound('Enrollment key not found.');
  }
  if (type === 'cv') {
    if (!key.cv_path) {
      throw ApiError.notFound('No CV was uploaded for this key.');
    }
    return key.cv_path;
  }
  const certificatePaths =
    typeof key.certificate_paths === 'string'
      ? JSON.parse(key.certificate_paths)
      : key.certificate_paths || [];
  const certificatePath = certificatePaths[index];
  if (!certificatePath) {
    throw ApiError.notFound('Certificate not found.');
  }
  return certificatePath;
}

async function listTutorKeys() {
  const rows = await repository.listTutorKeys();
  return rows.map((row) => toSafeTutorKey(row, { includeCode: false }));
}

async function revokeTutorKey(adminUser, keyId) {
  const key = await repository.findTutorKeyById(keyId);
  if (!key) {
    throw ApiError.notFound('Enrollment key not found.');
  }
  if (key.status !== 'UNUSED') {
    throw ApiError.badRequest('Only an unused key can be revoked.');
  }

  await repository.revokeTutorKey(keyId);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_KEY_REVOKED',
    entityType: 'tutor_enrollment_key',
    entityId: keyId,
  });
}

// delete btn - permanently remove key record
async function deleteTutorKey(adminUser, keyId) {
  const key = await repository.findTutorKeyById(keyId);
  if (!key) {
    throw ApiError.notFound('Enrollment key not found.');
  }

  await repository.deleteTutorKey(keyId);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_KEY_DELETED',
    entityType: 'tutor_enrollment_key',
    entityId: keyId,
  });
}

async function getDashboardStats() {
  const [counts, revenueTrend, recentActivity] = await Promise.all([
    repository.getCoreCounts(),
    repository.getRevenueTrend(),
    // fetch enough rows for the scrollable activity panel
    repository.listRecentActivity(50),
  ]);

  return {
    ...counts,
    revenueTrend,
    recentActivity: recentActivity.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorName: row.actor_name || 'System',
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      createdAt: row.created_at,
    })),
  };
}

async function listUsers(filters) {
  const rows = await repository.listUsers(filters);
  return rows.map(toSafeUserForAdmin);
}

async function assertCanActOnUser(actingUser, targetUser) {
  if (actingUser.role === ROLES.ADMIN) {
    return;
  }
  if (actingUser.role === ROLES.TUTOR) {
    if (targetUser.role !== ROLES.STUDENT_PARENT) {
      throw ApiError.forbidden('Tutors can only suspend or reactivate Student/Parent accounts.');
    }
    const isMyStudent = await repository.isStudentEnrolledWithTutor(targetUser.id, actingUser.id);
    if (!isMyStudent) {
      throw ApiError.forbidden('You can only suspend a student enrolled in one of your classes.');
    }
    return;
  }
  throw ApiError.forbidden();
}

async function suspendUser(actingUser, userId, confirmName) {
  if (userId === actingUser.id) {
    throw ApiError.badRequest('You cannot suspend your own account.');
  }
  const targetUser = await repository.findUserById(userId);
  if (!targetUser) {
    throw ApiError.notFound('User not found.');
  }

  await assertCanActOnUser(actingUser, targetUser);

  const expectedConfirmation = targetUser.full_name.trim().toUpperCase();
  if ((confirmName || '').trim() !== expectedConfirmation) {
    throw ApiError.badRequest(
      `Please type the name "${expectedConfirmation}" in capital letters exactly as shown to confirm.`
    );
  }

  if (targetUser.status === USER_STATUS.SUSPENDED) {
    throw ApiError.badRequest('This user is already suspended.');
  }

  await repository.updateUserStatus(userId, USER_STATUS.SUSPENDED);
  await recordAuditEvent({
    actorId: actingUser.id,
    action: 'USER_SUSPENDED',
    entityType: 'user',
    entityId: userId,
  });

  const updated = await repository.findUserById(userId);
  return toSafeUserForAdmin(updated);
}

async function activateUser(actingUser, userId) {
  const targetUser = await repository.findUserById(userId);
  if (!targetUser) {
    throw ApiError.notFound('User not found.');
  }

  await assertCanActOnUser(actingUser, targetUser);

  if (targetUser.status === USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('This user is already active.');
  }

  await repository.updateUserStatus(userId, USER_STATUS.ACTIVE);
  await recordAuditEvent({
    actorId: actingUser.id,
    action: 'USER_ACTIVATED',
    entityType: 'user',
    entityId: userId,
  });

  const updated = await repository.findUserById(userId);
  return toSafeUserForAdmin(updated);
}

// tutor's student list
async function listMyStudents(tutorUser) {
  const rows = await repository.listStudentsForTutor(tutorUser.id);
  return rows.map((row) => ({
    ...toSafeUserForAdmin(row),
    classNames: row.class_names,
  }));
}

function assertValidTargetGrade(targetGrade) {
  if (targetGrade && !GRADES.includes(targetGrade)) {
    throw ApiError.badRequest('Please choose a valid grade.');
  }
}

async function createAnnouncement(adminUser, { title, body, priority, targetAudience, targetGrade }) {
  assertValidTargetGrade(targetGrade);
  const announcementId = await repository.createAnnouncement({
    title,
    body,
    priority,
    targetAudience,
    targetGrade,
    publishedBy: adminUser.id,
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'ANNOUNCEMENT_PUBLISHED',
    entityType: 'announcement',
    entityId: announcementId,
    details: { targetAudience },
  });

  const created = await repository.findAnnouncementById(announcementId);
  return toSafeAnnouncement(created);
}

async function updateAnnouncement(adminUser, announcementId, { title, body, priority, targetAudience, targetGrade }) {
  assertValidTargetGrade(targetGrade);
  const existing = await repository.findAnnouncementById(announcementId);
  if (!existing || existing.status === 'ARCHIVED') {
    throw ApiError.notFound('Announcement not found.');
  }

  await repository.updateAnnouncement(announcementId, {
    title,
    body,
    priority,
    targetAudience,
    targetGrade,
    updatedBy: adminUser.id,
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'ANNOUNCEMENT_UPDATED',
    entityType: 'announcement',
    entityId: announcementId,
    details: { targetAudience },
  });

  const updated = await repository.findAnnouncementById(announcementId);
  return toSafeAnnouncement(updated);
}

async function deleteAnnouncement(adminUser, announcementId) {
  const existing = await repository.findAnnouncementById(announcementId);
  if (!existing || existing.status === 'ARCHIVED') {
    throw ApiError.notFound('Announcement not found.');
  }

  await repository.archiveAnnouncement(announcementId, adminUser.id);

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'ANNOUNCEMENT_REMOVED',
    entityType: 'announcement',
    entityId: announcementId,
    details: {},
  });
}

async function listAllAnnouncements() {
  const rows = await repository.listAllAnnouncements();
  return rows.map(toSafeAnnouncement);
}

// notification bell - announcements for this user
async function listAnnouncementsForUser(user) {
  const fullUser = await repository.findUserById(user.id);
  const rows = await repository.listAnnouncementsForAudience(user.role, fullUser ? fullUser.grade : null);
  return rows.map(toSafeAnnouncement);
}

async function findReminderRows(type) {
  return type === 'FEE_DUE'
    ? repository.findStudentsWithOverdueFees()
    : repository.findStudentsWithLowAttendance(config.business.lowAttendanceThresholdPercent);
}

// list students a reminder would reach
async function getReminderCandidates(type) {
  const rows = await findReminderRows(type);

  const byStudent = new Map();
  for (const row of rows) {
    if (!byStudent.has(row.student_id)) {
      byStudent.set(row.student_id, {
        studentId: row.student_id,
        fullName: row.full_name,
        email: row.email,
        details: [],
      });
    }
    const entry = byStudent.get(row.student_id);
    entry.details.push(
      type === 'FEE_DUE'
        ? `${row.subject}: LKR ${Number(row.balance).toFixed(2)} due`
        : `${row.subject}: ${Math.round((row.attended_sessions / row.total_sessions) * 100)}% attendance`
    );
  }

  return Array.from(byStudent.values());
}

// send reminders btn - to selected students, or everyone that matches
async function sendReminders(adminUser, { type, studentIds }) {
  const allRows = await findReminderRows(type);
  const recipients =
    Array.isArray(studentIds) && studentIds.length > 0
      ? allRows.filter((row) => studentIds.includes(row.student_id))
      : allRows;

  let sentCount = 0;
  for (const recipient of recipients) {
    const message =
      type === 'FEE_DUE'
        ? `Reminder: your fee balance of LKR ${Number(recipient.balance).toFixed(2)} for ${recipient.subject} is outstanding.`
        : `Reminder: your attendance for ${recipient.subject} has fallen below ${config.business.lowAttendanceThresholdPercent}%. Please contact your tutor.`;

    const result = await gateway.sendNotification({ channel: 'EMAIL', message });
    if (result.delivered) {
      await repository.logNotification({
        recipientId: recipient.student_id,
        channel: 'EMAIL',
        type,
        message,
        sentBy: adminUser.id,
      });
      sentCount += 1;
    }
  }

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'REMINDERS_SENT',
    entityType: 'notification_batch',
    details: { type, sentCount, targeted: Array.isArray(studentIds) && studentIds.length > 0 },
  });

  return { type, recipientCount: recipients.length, sentCount };
}

// notification bell - personal reminders for this user
async function listMyNotifications(user) {
  const rows = await repository.listNotificationsForUser(user.id, 30);
  return rows.map(toSafeNotification);
}

module.exports = {
  getDashboardStats,
  listUsers,
  createUser,
  generateTutorKey,
  getTutorKeyDocumentPath,
  listTutorKeys,
  revokeTutorKey,
  deleteTutorKey,
  suspendUser,
  activateUser,
  listMyStudents,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  listAnnouncementsForUser,
  sendReminders,
  getReminderCandidates,
  listMyNotifications,
};
