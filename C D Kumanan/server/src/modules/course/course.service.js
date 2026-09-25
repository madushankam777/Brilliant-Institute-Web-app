// Course module - business logic
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafeClass, toSafeTutorProfile } = require('../../../../../shared/server/src/utils/sanitize');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const repository = require('./course.repository');
const holidayCalendar = require('./holidayCalendar');
const {
  hasClassEvents,
  migrationRequired,
} = require('../../../../../shared/server/src/utils/schemaFeatures');

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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "15:00:00" -> "3:00 PM"
function formatTime(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function assertValidStartDate(startDate, dayOfWeek) {
  if (!startDate) return;
  if (startDate < todayDateString()) {
    throw ApiError.badRequest('The first class date cannot be in the past.');
  }
  const weekday = DAY_NAMES[new Date(`${startDate}T00:00:00`).getDay()];
  if (weekday !== dayOfWeek) {
    throw ApiError.badRequest(`The first class date is a ${weekday}, but the class is set for ${dayOfWeek}.`);
  }
  const [holiday] = await holidayCalendar.getHolidays(startDate, startDate);
  if (holiday) {
    throw ApiError.badRequest(`That day is a public holiday (${holiday.name}). Pick another first class date.`);
  }
}

// A tutor or a venue can only hold one class at a time.
async function assertNoScheduleConflicts({ tutorId, venue, dayOfWeek, startTime, endTime, excludeClassId }) {
  const tutorClash = await repository.findConflictingTutorClass({
    tutorId,
    dayOfWeek,
    startTime,
    endTime,
    excludeClassId,
  });
  if (tutorClash) {
    throw ApiError.conflict(
      `${tutorClash.tutor_name} already teaches "${tutorClash.subject}" on ${dayOfWeek} from ` +
        `${formatTime(tutorClash.start_time)} to ${formatTime(tutorClash.end_time)}. Pick a different time.`
    );
  }

  const venueClash = await repository.findConflictingVenueClass({
    venue,
    dayOfWeek,
    startTime,
    endTime,
    excludeClassId,
  });
  if (venueClash) {
    throw ApiError.conflict(
      `${venue} is already booked for "${venueClash.subject}" on ${dayOfWeek} from ` +
        `${formatTime(venueClash.start_time)} to ${formatTime(venueClash.end_time)}. Choose a different venue or time.`
    );
  }
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
  await assertValidStartDate(data.startDate, data.dayOfWeek);
  await assertNoScheduleConflicts({ tutorId, ...data });

  const classId = await repository.createClass({ ...data, tutorId });
  await recordAuditEvent({
    actorId: actingUser.id,
    action: 'CLASS_CREATED',
    entityType: 'class',
    entityId: classId,
    details: actingUser.role === ROLES.ADMIN ? { assignedTutorId: tutorId } : undefined,
  });

  const created = await repository.findClassWithTutorAndCount(classId);
  return { classData: toSafeClass(created) };
}

// Which edits a student actually needs to hear about. Cosmetic edits
// (description wording, capacity) don't earn a notification.
const NOTIFIABLE_FIELDS = [
  { key: 'dayOfWeek', column: 'day_of_week', label: 'day', kind: 'text' },
  { key: 'startTime', column: 'start_time', label: 'start time', kind: 'time' },
  { key: 'endTime', column: 'end_time', label: 'end time', kind: 'time' },
  { key: 'venue', column: 'venue', label: 'venue', kind: 'text' },
  { key: 'fee', column: 'fee', label: 'fee', kind: 'number' },
  { key: 'subject', column: 'subject', label: 'class title', kind: 'text' },
];

// MySQL hands times back as "15:00:00" while the form sends "15:00", so
// times are compared on HH:MM only.
function hasFieldChanged(field, before, after) {
  if (before === undefined || before === null || after === undefined || after === null) return false;
  if (field.kind === 'number') return Number(before) !== Number(after);
  if (field.kind === 'time') return String(before).slice(0, 5) !== String(after).slice(0, 5);
  return String(before) !== String(after);
}

function describeClassChanges(existing, data) {
  return NOTIFIABLE_FIELDS.filter((field) =>
    hasFieldChanged(field, existing[field.column], data[field.key])
  ).map((field) => `${field.label} is now ${data[field.key]}`);
}

// Tell everyone enrolled that their class moved/changed. Never blocks the
// edit itself - a notification that fails to send shouldn't undo the update.
async function notifyEnrolledStudents(classId, message, actorId) {
  try {
    const studentIds = await repository.listActiveStudentIdsForClass(classId);
    for (const studentId of studentIds) {
      await repository.createNotification({
        recipientId: studentId,
        type: 'CLASS_REMINDER',
        message: message.slice(0, 500),
        sentBy: actorId,
      });
    }
    return studentIds.length;
  } catch (error) {
    return 0;
  }
}

async function updateClass(tutorUser, classId, data) {
  const existing = await repository.findClassById(classId);
  assertOwnsClass(tutorUser, existing);
  if (existing.status !== 'ACTIVE') {
    throw ApiError.badRequest('A cancelled class cannot be edited.');
  }

  await assertNoScheduleConflicts({
    tutorId: existing.tutor_id,
    ...data,
    excludeClassId: classId,
  });

  const changes = describeClassChanges(existing, data);

  await repository.updateClass(classId, data);
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'CLASS_UPDATED',
    entityType: 'class',
    entityId: classId,
    details: changes.length > 0 ? { changes } : undefined,
  });

  let notifiedCount = 0;
  if (changes.length > 0) {
    notifiedCount = await notifyEnrolledStudents(
      classId,
      `"${data.subject || existing.subject}" has been updated: ${changes.join(', ')}.`,
      tutorUser.id
    );
  }

  const updated = await repository.findClassWithTutorAndCount(classId);
  return { classData: toSafeClass(updated), notifiedCount };
}

async function cancelClass(tutorUser, classId) {
  const existing = await repository.findClassById(classId);
  assertOwnsClass(tutorUser, existing);

  const notifiedCount = await notifyEnrolledStudents(
    classId,
    `"${existing.subject}" has been cancelled. Please contact the institute if you have questions.`,
    tutorUser.id
  );

  await repository.cancelClass(classId);
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'CLASS_CANCELLED',
    entityType: 'class',
    entityId: classId,
  });

  return { notifiedCount };
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

// --- Cancelled days and extra classes ---

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function weekdayOf(dateString) {
  return DAY_NAMES[new Date(`${dateString}T00:00:00`).getDay()];
}

// "2026-09-22" -> "Tuesday, 22 September 2026"
function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function toSafeClassEvent(row) {
  const isExtra = row.type === 'EXTRA';
  return {
    id: row.id,
    classId: row.class_id,
    date: row.event_date,
    type: row.type,
    startTime: isExtra ? row.start_time : row.class_start_time,
    endTime: isExtra ? row.end_time : row.class_end_time,
    venue: isExtra ? row.venue : row.class_venue,
    note: row.note,
    subject: row.subject,
    level: row.level,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

async function requireClassEvents() {
  if (!(await hasClassEvents())) throw migrationRequired();
}

// Students only see changes to their own classes; staff see everything
// (tutors need the whole picture to find a free room for an extra class).
async function listClassEvents(user, fromDate, toDate) {
  if (!(await hasClassEvents())) return [];
  const studentId = user.role === ROLES.STUDENT_PARENT ? user.id : null;
  const rows = await repository.listClassEvents({ fromDate, toDate, studentId });
  return rows.map(toSafeClassEvent);
}

async function findActiveOwnedClass(user, classId) {
  const classRow = await repository.findClassById(classId);
  assertOwnsClass(user, classRow);
  if (classRow.status !== 'ACTIVE') {
    throw ApiError.badRequest('This class has been cancelled.');
  }
  return classRow;
}

async function cancelClassDay(user, classId, { date, note }) {
  await requireClassEvents();
  const classRow = await findActiveOwnedClass(user, classId);

  if (date < todayDateString()) {
    throw ApiError.badRequest('You cannot cancel a class in the past.');
  }
  if (weekdayOf(date) !== classRow.day_of_week) {
    throw ApiError.badRequest(`"${classRow.subject}" runs on ${classRow.day_of_week}s, not on ${formatDate(date)}.`);
  }
  if (classRow.start_date && date < classRow.start_date) {
    throw ApiError.badRequest('This class has not started yet on that date.');
  }
  const [holiday] = await holidayCalendar.getHolidays(date, date);
  if (holiday) {
    throw ApiError.badRequest(`${formatDate(date)} is a public holiday (${holiday.name}), so there is no class anyway.`);
  }
  if (await repository.findCancelledDay(classId, date)) {
    throw ApiError.conflict('This class is already cancelled on that day.');
  }

  const eventId = await repository.createClassEvent({
    classId,
    eventDate: date,
    type: 'CANCELLED',
    note,
    createdBy: user.id,
  });
  await recordAuditEvent({
    actorId: user.id,
    action: 'CLASS_DAY_CANCELLED',
    entityType: 'class',
    entityId: classId,
    details: { date, eventId },
  });

  const reason = note ? ` Reason: ${note}` : '';
  const notifiedCount = await notifyEnrolledStudents(
    classId,
    `"${classRow.subject}" on ${formatDate(date)} is cancelled.${reason}`,
    user.id
  );

  const event = await repository.findClassEvent(eventId);
  return { event: toSafeClassEvent(event), notifiedCount };
}

// A room or a tutor can only hold one class at a time on that day,
// counting weekly classes and other extra classes.
async function assertExtraClassSlotFree({ date, startTime, endTime, venue, tutorId }) {
  const slot = { eventDate: date, startTime, endTime, venue, tutorId };
  const clash =
    (await repository.findBusyWeeklyClass({ ...slot, dayOfWeek: weekdayOf(date) })) ||
    (await repository.findBusyExtraClass(slot));
  if (!clash) return;

  const time = `${formatTime(clash.start_time)} - ${formatTime(clash.end_time)}`;
  if (clash.venue === venue) {
    throw ApiError.conflict(
      `${venue} is booked for "${clash.subject}" (${clash.tutor_name}) from ${time} that day. ` +
        'Check the calendar and pick another time or hall.'
    );
  }
  throw ApiError.conflict(`${clash.tutor_name} already teaches "${clash.subject}" from ${time} that day.`);
}

async function addExtraClass(user, classId, { date, startTime, endTime, venue, note }) {
  await requireClassEvents();
  const classRow = await findActiveOwnedClass(user, classId);
  const room = venue || classRow.venue;

  if (date < todayDateString()) {
    throw ApiError.badRequest('An extra class cannot be in the past.');
  }
  const [holiday] = await holidayCalendar.getHolidays(date, date);
  if (holiday) {
    throw ApiError.badRequest(`${formatDate(date)} is a public holiday (${holiday.name}). Pick another day.`);
  }
  await assertExtraClassSlotFree({ date, startTime, endTime, venue: room, tutorId: classRow.tutor_id });

  const eventId = await repository.createClassEvent({
    classId,
    eventDate: date,
    type: 'EXTRA',
    startTime,
    endTime,
    venue: room,
    note,
    createdBy: user.id,
  });
  await recordAuditEvent({
    actorId: user.id,
    action: 'EXTRA_CLASS_ADDED',
    entityType: 'class',
    entityId: classId,
    details: { date, startTime, endTime, venue: room, eventId },
  });

  const notifiedCount = await notifyEnrolledStudents(
    classId,
    `Extra class for "${classRow.subject}" on ${formatDate(date)}, ` +
      `${formatTime(startTime)} - ${formatTime(endTime)} at ${room}.${note ? ` ${note}` : ''}`,
    user.id
  );

  const event = await repository.findClassEvent(eventId);
  return { event: toSafeClassEvent(event), notifiedCount };
}

// Restore a cancelled day, or remove an extra class
async function deleteClassEvent(user, eventId) {
  await requireClassEvents();
  const event = await repository.findClassEvent(eventId);
  if (!event) {
    throw ApiError.notFound('This class change was not found.');
  }
  assertOwnsClass(user, { tutor_id: event.tutor_id });
  if (event.event_date < todayDateString()) {
    throw ApiError.badRequest('Past class changes cannot be undone.');
  }

  await repository.deleteClassEvent(eventId);
  const restored = event.type === 'CANCELLED';
  await recordAuditEvent({
    actorId: user.id,
    action: restored ? 'CLASS_DAY_RESTORED' : 'EXTRA_CLASS_REMOVED',
    entityType: 'class',
    entityId: event.class_id,
    details: { date: event.event_date, eventId },
  });

  const message = restored
    ? `"${event.subject}" on ${formatDate(event.event_date)} is back on as usual.`
    : `The extra class for "${event.subject}" on ${formatDate(event.event_date)} has been cancelled.`;
  const notifiedCount = await notifyEnrolledStudents(event.class_id, message, user.id);

  return { restored, notifiedCount };
}

// Weekly timetable: a tutor's classes, or the classes a student attends.
// Anyone can see their own; only Admin can look up someone else's.
async function getTimetable(viewer, userId) {
  const targetId = userId || viewer.id;
  if (targetId !== viewer.id && viewer.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You can only view your own timetable.');
  }

  const person = await repository.findPersonForTimetable(targetId);
  if (!person) {
    throw ApiError.notFound('User not found.');
  }

  let rows = [];
  if (person.role === ROLES.TUTOR) rows = await repository.listTimetableForTutor(person.id);
  if (person.role === ROLES.STUDENT_PARENT) rows = await repository.listTimetableForStudent(person.id);

  return {
    person: { id: person.id, fullName: person.full_name, role: person.role, grade: person.grade },
    classes: rows.map(toSafeClass),
  };
}

module.exports = {
  listClassEvents,
  cancelClassDay,
  addExtraClass,
  deleteClassEvent,
  getTimetable,
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
