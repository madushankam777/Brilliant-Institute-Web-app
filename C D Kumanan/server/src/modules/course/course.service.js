// Course module - business logic
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafeClass, toSafeTutorProfile } = require('../../../../../shared/server/src/utils/sanitize');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const repository = require('./course.repository');

async function browseClasses(filters) {
  const rows = await repository.listActiveClasses(filters);
  return rows.map(toSafeClass);
}

async function listTutors() {
  const rows = await repository.listAllTutors();
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    profilePictureUrl: row.profile_picture_path,
  }));
}

async function getTutorProfile(tutorId) {
  const tutorRow = await repository.findTutorProfile(tutorId);
  if (!tutorRow) {
    throw ApiError.notFound('Tutor not found.');
  }
  const classRows = await repository.listActiveClassesByTutor(tutorId);
  return {
    tutor: toSafeTutorProfile(tutorRow),
    classes: classRows.map(toSafeClass),
  };
}

async function getClassDetails(classId) {
  const row = await repository.findClassWithTutorAndCount(classId);
  if (!row) {
    throw ApiError.notFound('Class not found.');
  }
  return toSafeClass(row);
}

function assertOwnsClass(user, classRow) {
  if (!classRow) {
    throw ApiError.notFound('Class not found.');
  }
  if (user.role === ROLES.ADMIN) return;
  if (classRow.tutor_id !== user.id) {
    throw ApiError.forbidden('You can only manage your own classes.');
  }
}

// check for schedule clash
async function checkScheduleConflicts({ tutorId, venue, dayOfWeek, startTime, endTime, excludeClassId }) {
  const venueClash = await repository.findConflictingVenueClass({
    venue,
    dayOfWeek,
    startTime,
    endTime,
    excludeClassId,
  });
  if (venueClash) {
    throw ApiError.conflict(
      `This venue is already booked for "${venueClash.subject}" on ${dayOfWeek} ` +
        `${venueClash.start_time}-${venueClash.end_time}. Choose a different venue, day, or time.`
    );
  }

  const tutorClash = await repository.findConflictingTutorClass({
    tutorId,
    dayOfWeek,
    startTime,
    endTime,
    excludeClassId,
  });
  if (tutorClash) {
    return [
      `You already have a class scheduled on ${dayOfWeek} ${tutorClash.start_time}-${tutorClash.end_time} ` +
        `at ${tutorClash.venue} (${tutorClash.subject}).`,
    ];
  }
  return [];
}

// pick the tutor for a new class
async function resolveTutorForNewClass(actingUser, requestedTutorId) {
  if (actingUser.role !== ROLES.ADMIN) {
    return actingUser.id;
  }
  if (!requestedTutorId) {
    throw ApiError.badRequest('Please select which Tutor this class belongs to.');
  }
  const tutor = await repository.findActiveTutorById(requestedTutorId);
  if (!tutor) {
    throw ApiError.badRequest('Please select a valid, active Tutor.');
  }
  return tutor.id;
}

async function createClass(actingUser, data) {
  const tutorId = await resolveTutorForNewClass(actingUser, data.tutorId);
  const warnings = await checkScheduleConflicts({ tutorId, ...data });

  const classId = await repository.createClass({ ...data, tutorId });
  await recordAuditEvent({
    actorId: actingUser.id,
    action: 'CLASS_CREATED',
    entityType: 'class',
    entityId: classId,
    details: actingUser.role === ROLES.ADMIN ? { assignedTutorId: tutorId } : undefined,
  });

  const created = await repository.findClassWithTutorAndCount(classId);
  return { classData: toSafeClass(created), warnings };
}

async function updateClass(tutorUser, classId, data) {
  const existing = await repository.findClassById(classId);
  assertOwnsClass(tutorUser, existing);
  if (existing.status !== 'ACTIVE') {
    throw ApiError.badRequest('A cancelled class cannot be edited.');
  }

  const warnings = await checkScheduleConflicts({
    tutorId: existing.tutor_id,
    ...data,
    excludeClassId: classId,
  });

  await repository.updateClass(classId, data);
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'CLASS_UPDATED',
    entityType: 'class',
    entityId: classId,
  });

  const updated = await repository.findClassWithTutorAndCount(classId);
  return { classData: toSafeClass(updated), warnings };
}

async function cancelClass(tutorUser, classId) {
  const existing = await repository.findClassById(classId);
  assertOwnsClass(tutorUser, existing);

  await repository.cancelClass(classId);
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'CLASS_CANCELLED',
    entityType: 'class',
    entityId: classId,
  });
}

// My Classes - all classes for admin, own classes for tutor
async function listMyTaughtClasses(user) {
  const rows =
    user.role === ROLES.ADMIN
      ? await repository.listAllClasses()
      : await repository.listClassesByTutor(user.id);
  return rows.map(toSafeClass);
}

async function enrollInClass(studentUser, classId) {
  const classRow = await repository.findClassById(classId);
  if (!classRow || classRow.status !== 'ACTIVE') {
    throw ApiError.notFound('This class is not available for enrolment.');
  }

  const existing = await repository.findEnrollment(studentUser.id, classId);
  if (existing && existing.status === 'ACTIVE') {
    throw ApiError.conflict('You are already enrolled in this class.');
  }

  const enrolledCount = await repository.countActiveEnrollments(classId);
  if (enrolledCount >= classRow.capacity) {
    throw ApiError.conflict('This class is full. Please check back later or choose another class.');
  }

  let enrollmentId;
  if (existing) {
    // re-add btn - reuse the old row instead of a duplicate
    await repository.reactivateEnrollment(existing.id, classRow.fee);
    enrollmentId = existing.id;
  } else {
    enrollmentId = await repository.createEnrollment(studentUser.id, classId, classRow.fee);
  }

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'CLASS_ENROLLED',
    entityType: 'enrollment',
    entityId: enrollmentId,
    details: { classId },
  });

  return { enrollmentId, classId, subject: classRow.subject, fee: Number(classRow.fee) };
}

async function dropClass(studentUser, enrollmentId) {
  const rows = await repository.listMyEnrollments(studentUser.id);
  const enrollment = rows.find((row) => row.enrollment_id === enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found.');
  }
  if (enrollment.enrollment_status !== 'ACTIVE') {
    throw ApiError.badRequest('This enrolment has already been dropped.');
  }

  await repository.dropEnrollment(enrollmentId);
  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'CLASS_DROPPED',
    entityType: 'enrollment',
    entityId: enrollmentId,
  });
}

// delete btn - only for already-dropped classes
async function deleteEnrollmentRecord(studentUser, enrollmentId, confirmText) {
  if (confirmText !== 'DELETE') {
    throw ApiError.badRequest('Please type DELETE in capital letters to confirm.');
  }

  const rows = await repository.listMyEnrollments(studentUser.id);
  const enrollment = rows.find((row) => row.enrollment_id === enrollmentId);
  if (!enrollment) {
    throw ApiError.notFound('Enrollment not found.');
  }
  if (enrollment.enrollment_status !== 'DROPPED') {
    throw ApiError.badRequest('Drop this class before removing it from your history.');
  }

  await repository.removeEnrollmentRecord(enrollmentId);
  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'CLASS_ENROLLMENT_REMOVED',
    entityType: 'enrollment',
    entityId: enrollmentId,
  });
}

async function listMyCourses(studentUser) {
  const rows = await repository.listMyEnrollments(studentUser.id);
  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    enrollmentStatus: row.enrollment_status,
    balance: Number(row.balance),
    enrolledAt: row.enrolled_at,
    dropDate: row.drop_date,
    classId: row.id,
    subject: row.subject,
    subjectArea: row.subject_area,
    level: row.level,
    venue: row.venue,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    classStatus: row.status,
    tutorName: row.tutor_name,
  }));
}

module.exports = {
  browseClasses,
  listTutors,
  getTutorProfile,
  getClassDetails,
  createClass,
  updateClass,
  cancelClass,
  listMyTaughtClasses,
  enrollInClass,
  dropClass,
  deleteEnrollmentRecord,
  listMyCourses,
};
