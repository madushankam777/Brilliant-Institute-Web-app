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
const { GRADES, nextGrade, isFinalGrade } = require('../../../../../shared/server/src/config/grades');
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

// view profile btn - Admin also sees the CV/certificates captured when this
// tutor's enrollment key was issued. Tutors never get this on their own
// profile: every route serving it sits behind authorize(ADMIN).
async function getUserProfile(userId) {
  const user = await repository.findUserById(userId);
  if (!user || user.status === 'DELETED') {
    throw ApiError.notFound('User not found.');
  }

  const safeUser = toSafeUserForAdmin(user);
  if (user.role !== ROLES.TUTOR) {
    return safeUser;
  }

  const key = await repository.findTutorKeyByUserId(userId);
  return { ...safeUser, enrollmentKey: key ? toSafeTutorKey(key, { includeCode: false }) : null };
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

// delete btn - only a suspended account can be deleted, so nobody's access
// gets pulled by this call alone (suspend is the actual access-revoking step)
async function deleteUser(actingUser, userId) {
  if (userId === actingUser.id) {
    throw ApiError.badRequest('You cannot delete your own account.');
  }
  const targetUser = await repository.findUserById(userId);
  if (!targetUser || targetUser.status === USER_STATUS.DELETED) {
    throw ApiError.notFound('User not found.');
  }
  if (targetUser.status !== USER_STATUS.SUSPENDED) {
    throw ApiError.badRequest('Suspend this account first, then delete it.');
  }

  await repository.softDeleteUser(userId);
  await recordAuditEvent({
    actorId: actingUser.id,
    action: 'USER_DELETED',
    entityType: 'user',
    entityId: userId,
  });
}

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

// --- Student re-registration -------------------------------------------------
// Each January the institute reopens: a student who re-registers moves up a
// grade, one who doesn't is closed out. Admin issues a one-time key for a
// student, reads it out to them, and the student types it in to confirm.

const REREGISTRATION_KEY_VALID_DAYS = 120;

function generateReregistrationKeyCode() {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `REG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function currentAcademicYear() {
  return new Date().getFullYear();
}

async function generateReregistrationKey(adminUser, { studentId, toGrade, academicYear }) {
  const student = await repository.findUserById(studentId);
  if (!student || student.role !== ROLES.STUDENT_PARENT) {
    throw ApiError.badRequest('Please choose a student to re-register.');
  }
  if (student.status === USER_STATUS.DELETED) {
    throw ApiError.badRequest('That account has been deleted.');
  }

  const thisYear = currentAcademicYear();
  const year = Number(academicYear) || thisYear + 1;
  if (year < thisYear || year > thisYear + 1) {
    throw ApiError.badRequest(`Keys can only be issued for ${thisYear} or ${thisYear + 1}.`);
  }

  // Default to one grade up. Admin can override for a student repeating a
  // year or joining at a different level.
  const resolvedGrade = toGrade || nextGrade(student.grade);
  if (!resolvedGrade) {
    throw ApiError.badRequest(
      `${student.full_name} is in ${student.grade || 'the final grade'} and has finished - there is no grade above it.`
    );
  }
  if (!GRADES.includes(resolvedGrade)) {
    throw ApiError.badRequest('Please choose a valid grade.');
  }

  const keyCode = generateReregistrationKeyCode();
  const expiresAt = new Date(Date.now() + REREGISTRATION_KEY_VALID_DAYS * 24 * 60 * 60 * 1000);
  const keyId = await repository.createReregistrationKey({
    keyCode,
    studentId: student.id,
    fromGrade: student.grade,
    toGrade: resolvedGrade,
    academicYear: year,
    expiresAt,
    createdBy: adminUser.id,
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'REREGISTRATION_KEY_ISSUED',
    entityType: 'student_reregistration_key',
    entityId: keyId,
    details: { studentId: student.id, toGrade: resolvedGrade, academicYear: year },
  });

  // The key itself never goes through the bell - it is read out to the student
  // in person, the same way tutor enrollment keys are handed over.
  await repository.logNotification({
    recipientId: student.id,
    channel: 'IN_APP',
    type: 'REREGISTRATION',
    message:
      `Re-registration for ${year} is open. Ask the office for your key, then enter it on the ` +
      `Re-register page to confirm your place in ${resolvedGrade}.`,
    sentBy: adminUser.id,
  });

  return {
    id: keyId,
    keyCode,
    studentId: student.id,
    studentName: student.full_name,
    fromGrade: student.grade,
    toGrade: resolvedGrade,
    academicYear: year,
    expiresAt,
  };
}

// The code is shown once, when it is created, and never listed again.
function toSafeReregistrationKey(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    studentCode: row.student_code,
    studentStatus: row.student_status,
    currentGrade: row.current_grade,
    fromGrade: row.from_grade,
    toGrade: row.to_grade,
    academicYear: row.academic_year,
    status: row.status,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

async function listReregistrationKeys(academicYear) {
  const year = Number(academicYear);
  const rows = await repository.listReregistrationKeys(Number.isInteger(year) ? year : null);
  return rows.map(toSafeReregistrationKey);
}

async function revokeReregistrationKey(adminUser, keyId) {
  const key = await repository.findReregistrationKeyById(keyId);
  if (!key) {
    throw ApiError.notFound('Re-registration key not found.');
  }
  const revoked = await repository.revokeReregistrationKey(keyId);
  if (!revoked) {
    throw ApiError.badRequest('Only an unused key can be revoked.');
  }

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'REREGISTRATION_KEY_REVOKED',
    entityType: 'student_reregistration_key',
    entityId: keyId,
  });
}

// The student's side: type the key, confirm the place.
async function redeemReregistrationKey(studentUser, keyCode) {
  const normalised = String(keyCode || '').trim().toUpperCase();
  const key = await repository.findRedeemableKeyForStudent(normalised, studentUser.id);
  if (!key) {
    throw ApiError.badRequest(
      'That key is not valid for your account, has already been used, or has expired.'
    );
  }

  // Claim it before anything changes, so a key can only ever be spent once.
  const claimed = await repository.markReregistrationKeyUsed(key.id);
  if (!claimed) {
    throw ApiError.conflict('That key has just been used.');
  }

  // A key for a year already under way takes effect now. One for next year
  // only confirms the place - the January roll-over moves the grade.
  const appliesNow = key.academic_year <= currentAcademicYear();
  if (appliesNow) {
    await repository.setStudentGrade(studentUser.id, key.to_grade, key.academic_year);
  } else {
    await repository.setStudentReregistered(studentUser.id, key.academic_year);
  }

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'REREGISTRATION_COMPLETED',
    entityType: 'student_reregistration_key',
    entityId: key.id,
    details: { toGrade: key.to_grade, academicYear: key.academic_year, appliedImmediately: appliesNow },
  });

  const message = appliesNow
    ? `You are re-registered for ${key.academic_year} and have moved into ${key.to_grade}.`
    : `Your place for ${key.academic_year} is confirmed. You move into ${key.to_grade} on 1 January.`;

  await repository.logNotification({
    recipientId: studentUser.id,
    channel: 'IN_APP',
    type: 'REREGISTRATION',
    message,
    sentBy: null,
  });

  return {
    academicYear: key.academic_year,
    toGrade: key.to_grade,
    appliedImmediately: appliesNow,
    message,
  };
}

// What a student sees on their own re-registration page.
async function getMyReregistrationStatus(studentUser) {
  const user = await repository.findUserById(studentUser.id);
  if (!user) {
    throw ApiError.notFound('Account not found.');
  }
  const nextYear = currentAcademicYear() + 1;
  return {
    grade: user.grade,
    nextYear,
    confirmedForYear: user.reregistered_for_year || null,
    isConfirmedForNextYear: user.reregistered_for_year === nextYear,
    nextGrade: nextGrade(user.grade),
    isFinalGrade: isFinalGrade(user.grade),
  };
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

// tutor's own class list, for picking who a message goes to
async function listMyClassesForMessaging(tutorUser) {
  const rows = await repository.listClassesForTutor(tutorUser.id);
  return rows.map((row) => ({ id: row.id, subject: row.subject, level: row.level }));
}

// Tutor -> their own students and/or Admin. A tutor can never reach a student
// who isn't actively enrolled in one of their classes: the recipient list is
// built from their own enrollments, never from anything the client sends.
async function sendTutorMessage(tutorUser, { audience, classId, subject, message }) {
  const recipientIds = new Set();

  if (audience === 'STUDENTS' || audience === 'BOTH') {
    if (classId) {
      const ownsClass = (await repository.listClassesForTutor(tutorUser.id)).some(
        (row) => row.id === Number(classId)
      );
      if (!ownsClass) {
        throw ApiError.forbidden('You can only message students in your own classes.');
      }
    }
    const studentIds = await repository.listStudentIdsForTutor(tutorUser.id, classId);
    studentIds.forEach((id) => recipientIds.add(id));
  }

  if (audience === 'ADMIN' || audience === 'BOTH') {
    const adminIds = await repository.listAdminIds();
    adminIds.forEach((id) => recipientIds.add(id));
  }

  if (recipientIds.size === 0) {
    throw ApiError.badRequest(
      audience === 'ADMIN'
        ? 'No active Admin account was found to send this to.'
        : 'No students are actively enrolled in your classes yet.'
    );
  }

  // req.user only carries id/role/email, so read the tutor's display name
  const sender = await repository.findUserById(tutorUser.id);
  const senderName = sender ? sender.full_name : 'your tutor';
  const body = `${subject.trim()} - ${message.trim()} (from ${senderName})`;
  for (const recipientId of recipientIds) {
    await repository.logNotification({
      recipientId,
      channel: 'EMAIL',
      type: 'ANNOUNCEMENT',
      message: body.slice(0, 500),
      sentBy: tutorUser.id,
    });
  }

  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'TUTOR_MESSAGE_SENT',
    entityType: 'notification_batch',
    details: { audience, classId: classId || null, recipientCount: recipientIds.size },
  });

  return { recipientCount: recipientIds.size, audience };
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
  getUserProfile,
  generateTutorKey,
  getTutorKeyDocumentPath,
  listTutorKeys,
  revokeTutorKey,
  deleteTutorKey,
  suspendUser,
  activateUser,
  deleteUser,
  listMyStudents,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  listAnnouncementsForUser,
  sendReminders,
  getReminderCandidates,
  listMyNotifications,
  listMyClassesForMessaging,
  sendTutorMessage,
  generateReregistrationKey,
  listReregistrationKeys,
  revokeReregistrationKey,
  redeemReregistrationKey,
  getMyReregistrationStatus,
  currentAcademicYear,
};
