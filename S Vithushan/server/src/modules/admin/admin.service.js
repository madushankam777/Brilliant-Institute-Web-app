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
  REMINDER_PREFIX,
} = require('../../../../../shared/server/src/utils/sanitize');
const { USER_STATUS, ROLES } = require('../../../../../shared/server/src/config/roles');
const { GRADES, nextGrade, isFinalGrade } = require('../../../../../shared/server/src/config/grades');
const gateway = require('./notificationGateway');
const repository = require('./admin.repository');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { deleteUpload } = require('../../../../../shared/server/src/utils/fileStore');
const authService = require('../../../../../N Danushika/server/src/modules/auth/auth.service');

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

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
  // remove the key's CV and certificates too
  const certificatePaths =
    typeof key.certificate_paths === 'string' ? JSON.parse(key.certificate_paths) : key.certificate_paths || [];
  await Promise.all([key.cv_path, ...certificatePaths].filter(Boolean).map(deleteUpload));
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

// --- Revenue report: daily / monthly / yearly / last 5 years ---

// 'YYYY-MM-DD' plus n days (UTC maths, so no daylight-saving surprises)
function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// 'YYYY-MM'; a month of 0 or less rolls back into the previous year
function monthKey(year, month) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

// [first day included, first day after] for a run of buckets
function bucketRange(bucket, firstKey, lastKey) {
  if (bucket === 'day') return [firstKey, addDays(lastKey, 1)];
  if (bucket === 'month') {
    const [year, month] = lastKey.split('-').map(Number);
    return [`${firstKey}-01`, `${monthKey(year, month + 1)}-01`];
  }
  return [`${firstKey}-01-01`, `${Number(lastKey) + 1}-01-01`];
}

// revenue total and chart bars
async function getRevenueReport(period) {
  const today = await repository.getDatabaseToday();
  const [year, month] = today.split('-').map(Number);

  let bucket = 'month';
  const keys = [];
  let headlineKeys = [];

  if (period === 'daily') {
    bucket = 'day';
    for (let offset = 29; offset >= 0; offset -= 1) keys.push(addDays(today, -offset));
    headlineKeys = [today];
  } else if (period === 'monthly') {
    for (let offset = 11; offset >= 0; offset -= 1) keys.push(monthKey(year, month - offset));
    headlineKeys = [monthKey(year, month)];
  } else if (period === 'yearly') {
    for (let m = 1; m <= month; m += 1) keys.push(monthKey(year, m));
    headlineKeys = keys;
  } else {
    bucket = 'year';
    for (let y = year - 4; y <= year; y += 1) keys.push(String(y));
    headlineKeys = keys;
  }

  const [fromDate, toDate] = bucketRange(bucket, keys[0], keys[keys.length - 1]);
  const rows = await repository.sumRevenueByBucket(bucket, fromDate, toDate);
  const rowsByKey = new Map(rows.map((row) => [row.bucket, row]));

  const points = keys.map((key) => {
    const row = rowsByKey.get(key);
    return {
      key,
      total: row ? roundMoney(Number(row.total)) : 0,
      paymentCount: row ? Number(row.payment_count) : 0,
    };
  });
  const headline = points.filter((point) => headlineKeys.includes(point.key));

  return {
    period,
    bucket,
    today,
    total: roundMoney(headline.reduce((sum, point) => sum + point.total, 0)),
    paymentCount: headline.reduce((sum, point) => sum + point.paymentCount, 0),
    points,
  };
}

async function listUsers(filters) {
  const rows = await repository.listUsers(filters);
  return rows.map(toSafeUserForAdmin);
}

// view profile btn - admin also sees tutor documents
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
  if (!targetUser || targetUser.status === USER_STATUS.DELETED) {
    throw ApiError.notFound('User not found.');
  }

  await assertCanActOnUser(actingUser, targetUser);

  if (targetUser.status === USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('This user is already active.');
  }
  // tutors may only undo a suspension
  if (actingUser.role === ROLES.TUTOR) {
    if (targetUser.status !== USER_STATUS.SUSPENDED) {
      throw ApiError.forbidden('Only an Administrator can reopen this account.');
    }
    const suspendedByRole = await repository.findLastSuspenderRole(userId);
    if (suspendedByRole === ROLES.ADMIN) {
      throw ApiError.forbidden('This account was suspended by the office. Please contact an Administrator.');
    }
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

// delete btn - only a suspended account can be deleted
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

// Admin: one-time reset link to give the user in person
async function createPasswordResetLink(adminUser, userId) {
  const targetUser = await repository.findUserById(userId);
  if (!targetUser || targetUser.status === USER_STATUS.DELETED) {
    throw ApiError.notFound('User not found.');
  }
  if (targetUser.status !== USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('Reactivate this account before resetting its password.');
  }

  const token = await authService.createResetToken(userId);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PASSWORD_RESET_LINK_ISSUED',
    entityType: 'user',
    entityId: userId,
  });
  return {
    resetPath: `/reset-password?token=${token}`,
    expiresInMinutes: authService.RESET_TOKEN_TTL_MINUTES,
  };
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
// Each January a student who re-registered moves up a grade and one who did
// not is closed out. Admin issues one-time keys (for chosen students, a whole
// class or a whole grade) and the student types theirs in to confirm.

const REREGISTRATION_KEY_VALID_DAYS = 120;

function generateReregistrationKeyCode() {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `REG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function currentAcademicYear() {
  return new Date().getFullYear();
}

function resolveAcademicYear(academicYear) {
  const thisYear = currentAcademicYear();
  const year = Number(academicYear) || thisYear + 1;
  if (year < thisYear || year > thisYear + 1) {
    throw ApiError.badRequest(`Keys can only be issued for ${thisYear} or ${thisYear + 1}.`);
  }
  return year;
}

// What the Re-registration page lets admin pick from, with counts for search.
async function getReregistrationOptions() {
  const [students, classes] = await Promise.all([
    repository.listStudentsForReregistration(),
    repository.listClassesWithStudentCounts(),
  ]);
  return {
    students: students.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      studentCode: row.student_code,
      grade: row.grade,
      classNames: row.class_names || '',
    })),
    classes: classes.map((row) => ({
      id: row.id,
      subject: row.subject,
      level: row.level,
      tutorName: row.tutor_name,
      studentCount: Number(row.student_count),
    })),
    grades: GRADES.map((grade) => ({
      grade,
      studentCount: students.filter((student) => student.grade === grade).length,
    })),
  };
}

// The student list is always worked out here, never trusted from the browser.
async function findStudentsForKeys({ mode, studentIds, classId, grade }) {
  let ids = [];
  if (mode === 'CLASS') ids = await repository.listActiveStudentIdsInClass(classId);
  else if (mode === 'GRADE') ids = await repository.listActiveStudentIdsInGrade(grade);
  else ids = [...new Set((studentIds || []).map(Number))];
  return repository.listActiveStudentsByIds(ids);
}

async function generateReregistrationKeys(adminUser, { mode, studentIds, classId, grade, toGrade, academicYear }) {
  if (!(await schema.hasReregistration())) throw schema.migrationRequired();
  assertValidTargetGrade(toGrade);
  const year = resolveAcademicYear(academicYear);

  const students = await findStudentsForKeys({ mode, studentIds, classId, grade });
  if (students.length === 0) {
    const emptyMessages = {
      CLASS: 'No active students are enrolled in that class.',
      GRADE: 'No active students are in that grade.',
      STUDENTS: 'Choose at least one active student.',
    };
    throw ApiError.badRequest(emptyMessages[mode]);
  }

  const alreadyHasKey = new Set(
    await repository.findStudentIdsWithKey(students.map((student) => student.id), year)
  );
  const expiresAt = new Date(Date.now() + REREGISTRATION_KEY_VALID_DAYS * DAY_MS);
  const toIssue = [];
  const skipped = [];

  students.forEach((student) => {
    // default is one grade up; admin can pick a grade for repeaters
    const moveTo = toGrade || nextGrade(student.grade);
    if (alreadyHasKey.has(student.id)) {
      skipped.push({ studentId: student.id, studentName: student.full_name, reason: `Already has a key for ${year}.` });
    } else if (!moveTo) {
      skipped.push({
        studentId: student.id,
        studentName: student.full_name,
        reason: student.grade
          ? `Finished ${student.grade} - choose a grade to keep them.`
          : 'No grade on record - choose a grade for them.',
      });
    } else {
      toIssue.push({ student, moveTo, keyCode: generateReregistrationKeyCode() });
    }
  });

  // All keys in a batch are saved together, so no code is ever lost halfway.
  const issued = await repository.withTransaction(async (connection) => {
    const saved = [];
    for (const item of toIssue) {
      const keyId = await repository.createReregistrationKey(
        {
          keyCode: item.keyCode,
          studentId: item.student.id,
          fromGrade: item.student.grade,
          toGrade: item.moveTo,
          academicYear: year,
          expiresAt,
          createdBy: adminUser.id,
        },
        connection
      );
      saved.push({
        id: keyId,
        keyCode: item.keyCode,
        studentId: item.student.id,
        studentName: item.student.full_name,
        studentCode: item.student.student_code,
        fromGrade: item.student.grade,
        toGrade: item.moveTo,
        academicYear: year,
        expiresAt,
      });
    }
    return saved;
  });

  // The key itself is handed over in person - the bell only says to ask for it.
  for (const key of issued) {
    await repository.logNotification({
      recipientId: key.studentId,
      channel: 'IN_APP',
      type: 'REREGISTRATION',
      message:
        `Re-registration for ${year} is open. Ask the office for your key, then enter it on the ` +
        `Re-register page to confirm your place in ${key.toGrade}.`,
      sentBy: adminUser.id,
    });
  }

  if (issued.length > 0) {
    await recordAuditEvent({
      actorId: adminUser.id,
      action: 'REREGISTRATION_KEYS_ISSUED',
      entityType: 'student_reregistration_key',
      details: { mode, academicYear: year, issued: issued.length, skipped: skipped.length },
    });
  }

  return { academicYear: year, issued, skipped };
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
    classNames: row.class_names || '',
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
  // before the migration there simply are no keys yet
  if (!(await schema.hasReregistration())) return [];
  const year = Number(academicYear);
  const rows = await repository.listReregistrationKeys(Number.isInteger(year) ? year : null);
  return rows.map(toSafeReregistrationKey);
}

async function revokeReregistrationKey(adminUser, keyId) {
  if (!(await schema.hasReregistration())) throw schema.migrationRequired();
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

// delete btn - any key (a student who already used it keeps their place)
async function deleteReregistrationKey(adminUser, keyId) {
  if (!(await schema.hasReregistration())) throw schema.migrationRequired();
  const key = await repository.findReregistrationKeyById(keyId);
  if (!key) {
    throw ApiError.notFound('Re-registration key not found.');
  }
  await repository.deleteReregistrationKey(keyId);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'REREGISTRATION_KEY_DELETED',
    entityType: 'student_reregistration_key',
    entityId: keyId,
    details: { studentId: key.student_id, status: key.status },
  });
}

// The student's side: type the key, confirm the place.
async function redeemReregistrationKey(studentUser, keyCode) {
  if (!(await schema.hasReregistration())) {
    throw ApiError.badRequest('Re-registration is not open yet. Please check with the office.');
  }
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

  // A key for a year already under way takes effect now
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
    isOpen: await schema.hasReregistration(),
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

// Tutor -> their own students and/or Admin
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

// --- Scheduled reminders (tutor) ---

// "2026-10-12T15:30" -> a Date in the server's own time zone
function parseLocalDateTime(value) {
  const [datePart, timePart] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function toMysqlDateTime(date) {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`
  );
}

// audience: SELF, CLASS or ALL
async function scheduleReminder(tutorUser, { audience, classId, title, message, remindAt }) {
  const sendAt = parseLocalDateTime(remindAt);
  if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Pick a date and time in the future.');
  }
  if (sendAt.getTime() > Date.now() + 366 * DAY_MS) {
    throw ApiError.badRequest('Reminders can be set up to one year ahead.');
  }

  let recipientIds = [tutorUser.id];
  let classSubject = null;
  if (audience !== 'SELF') {
    if (audience === 'CLASS') {
      const myClasses = await repository.listClassesForTutor(tutorUser.id);
      const chosen = myClasses.find((row) => row.id === Number(classId));
      if (!chosen) {
        throw ApiError.forbidden('You can only remind students in your own classes.');
      }
      classSubject = chosen.subject;
    }
    recipientIds = await repository.listStudentIdsForTutor(tutorUser.id, audience === 'CLASS' ? classId : undefined);
    if (recipientIds.length === 0) {
      throw ApiError.badRequest(
        audience === 'CLASS' ? 'No students are enrolled in that class yet.' : 'No students are enrolled in your classes yet.'
      );
    }
  }

  const sender = await repository.findUserById(tutorUser.id);
  const text = [title.trim(), (message || '').trim()].filter(Boolean).join(' - ');
  const signature = audience === 'SELF' ? '' : ` (${classSubject ? `${classSubject}, ` : ''}from ${sender.full_name})`;
  const fullMessage = `${REMINDER_PREFIX}${text}${signature}`.slice(0, 500);
  const sendAtSql = toMysqlDateTime(sendAt);

  const duplicates = await repository.countUpcomingReminder({
    tutorId: tutorUser.id,
    message: fullMessage,
    sendAt: sendAtSql,
  });
  if (duplicates > 0) {
    throw ApiError.conflict('You already have this reminder set for that time.');
  }

  await repository.createScheduledNotifications(recipientIds, {
    type: 'CLASS_REMINDER',
    message: fullMessage,
    sentBy: tutorUser.id,
    sendAt: sendAtSql,
  });

  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'REMINDER_SCHEDULED',
    entityType: 'notification_batch',
    details: { audience, classId: classId || null, recipientCount: recipientIds.length, sendAt: sendAtSql },
  });

  return { recipientCount: recipientIds.length, sendAt: sendAtSql };
}

async function listMyReminders(tutorUser) {
  const rows = await repository.listRemindersByTutor(tutorUser.id, REMINDER_PREFIX);
  return rows.map((row) => ({
    id: row.id,
    message: row.message.slice(REMINDER_PREFIX.length),
    sendAt: row.sent_at,
    recipientCount: Number(row.recipient_count),
    isPersonal: Number(row.is_personal) === 1,
    status: Number(row.is_upcoming) === 1 ? 'SCHEDULED' : 'SENT',
  }));
}

async function cancelReminder(tutorUser, reminderId) {
  const row = await repository.findReminderRow(reminderId, tutorUser.id);
  if (!row || !String(row.message).startsWith(REMINDER_PREFIX)) {
    throw ApiError.notFound('Reminder not found.');
  }
  if (Number(row.is_upcoming) !== 1) {
    throw ApiError.badRequest('This reminder has already been sent.');
  }

  const removed = await repository.deleteUpcomingReminder({
    tutorId: tutorUser.id,
    message: row.message,
    sentAt: row.sent_at,
  });

  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'REMINDER_CANCELLED',
    entityType: 'notification_batch',
    details: { removed },
  });
}

module.exports = {
  deleteReregistrationKey,
  createPasswordResetLink,
  getRevenueReport,
  getReregistrationOptions,
  generateReregistrationKeys,
  scheduleReminder,
  listMyReminders,
  cancelReminder,
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
  listReregistrationKeys,
  revokeReregistrationKey,
  redeemReregistrationKey,
  getMyReregistrationStatus,
  currentAcademicYear,
};
