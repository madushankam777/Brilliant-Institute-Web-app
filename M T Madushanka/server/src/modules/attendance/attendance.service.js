// Attendance business logic
const crypto = require('crypto');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { createNotification } = require('../../../../../shared/server/src/utils/notifications');
const { toSafeClass } = require('../../../../../shared/server/src/utils/sanitize');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const { CHECKIN_CODE_VALID_MINUTES } = require('./attendance.constants');
const repository = require('./attendance.repository');

// only the class's own tutor (or an admin) may manage its attendance
async function assertTutorOwnsClass(tutorUser, classRow) {
  if (!classRow) {
    throw ApiError.notFound('Class not found.');
  }
  if (tutorUser.role === ROLES.ADMIN) return;
  if (classRow.tutor_id !== tutorUser.id) {
    throw ApiError.forbidden('You can only manage attendance for your own classes.');
  }
}

// class picker list - own classes for a tutor, every class for admin
async function getMyTaughtClasses(user) {
  const rows =
    user.role === ROLES.ADMIN
      ? await repository.listAllClassesWithTutor()
      : await repository.listClassesByTutor(user.id);
  return rows.map(toSafeClass);
}

// the sessions of a class, for its tutor
async function listClassSessions(tutorUser, classId) {
  const classRow = await repository.findClassById(classId);
  await assertTutorOwnsClass(tutorUser, classRow);
  const sessions = await repository.listSessionsForClass(classId);
  return { classSubject: classRow.subject, sessions };
}

// local date (toISOString gives the UTC date)
function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// mark attendance btn - find or make today's session
async function getOrCreateTodaySession(tutorUser, classId) {
  const classRow = await repository.findClassById(classId);
  await assertTutorOwnsClass(tutorUser, classRow);
  if (classRow.status !== 'ACTIVE') {
    throw ApiError.badRequest('This class has been cancelled.');
  }

  // use today's session if it exists, else make it from the class timetable
  const today = todayDateString();
  const existing = await repository.findSessionByClassAndDate(classId, today);
  if (existing) {
    return { sessionId: existing.id };
  }

  const sessionId = await repository.createSession({
    classId,
    sessionDate: today,
    startTime: classRow.start_time,
    endTime: classRow.end_time,
  });
  return { sessionId };
}

// make a random 6-digit key, e.g. "042371"
function generateCheckinCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// generate key btn
async function startSelfCheckIn(tutorUser, sessionId) {
  // find the session and check the tutor owns its class
  const session = await repository.findSessionWithClass(sessionId);
  if (!session) {
    throw ApiError.notFound('Class session not found.');
  }
  await assertTutorOwnsClass(tutorUser, { tutor_id: session.tutor_id });

  // regenerate on the rare chance another live session already has this code
  let code = generateCheckinCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await repository.findSessionByActiveCheckinCode(code);
    if (!clash) break;
    code = generateCheckinCode();
  }

  // the key stops working after CHECKIN_CODE_VALID_MINUTES
  const expiresAt = new Date(Date.now() + CHECKIN_CODE_VALID_MINUTES * 60 * 1000);
  await repository.setSessionCheckinCode(sessionId, code, expiresAt);

  // audit log - check-in opened
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'ATTENDANCE_CHECKIN_OPENED',
    entityType: 'class_session',
    entityId: sessionId,
  });

  return { code, expiresAt: expiresAt.toISOString(), validMinutes: CHECKIN_CODE_VALID_MINUTES };
}

// student enters the key the tutor read out / displayed
async function selfCheckIn(studentUser, code) {
  // find the live session this key belongs to
  const session = await repository.findSessionByActiveCheckinCode(code);
  if (!session) {
    throw ApiError.badRequest('That key is invalid or has expired. Ask your tutor for the current key.');
  }

  // only students enrolled in that class may check in
  const enrolledStudents = await repository.listActiveStudentsForClass(session.class_id);
  const isEnrolled = enrolledStudents.some((student) => student.student_id === studentUser.id);
  if (!isEnrolled) {
    throw ApiError.forbidden('You can only check in to a class you are enrolled in.');
  }

  // already present or late? then just say so
  const existing = await repository.findAttendanceRecord(session.id, studentUser.id);
  if (existing && existing.status !== 'ABSENT') {
    return { alreadyCheckedIn: true, subject: session.subject };
  }

  // marked absent, but here with the live key - they did come, so mark them present
  if (existing) {
    await repository.updateAttendanceRecord(existing.id, {
      status: 'PRESENT',
      remarks: 'Checked in with the attendance key after being marked absent',
      markedBy: studentUser.id,
    });
    await recordAuditEvent({
      actorId: studentUser.id,
      action: 'ATTENDANCE_CODE_CHECKIN',
      entityType: 'class_session',
      entityId: session.id,
      details: { previousStatus: 'ABSENT' },
    });
    return { alreadyCheckedIn: false, subject: session.subject };
  }

  // mark the student PRESENT
  await repository.createAttendanceRecord({
    sessionId: session.id,
    studentId: studentUser.id,
    status: 'PRESENT',
    remarks: 'Self check-in with attendance key',
    markedBy: studentUser.id,
  });

  // audit log - checked in with a key
  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'ATTENDANCE_CODE_CHECKIN',
    entityType: 'class_session',
    entityId: session.id,
  });

  return { alreadyCheckedIn: false, subject: session.subject };
}

// the sheet - every enrolled student with their mark for this session (null = not marked yet)
async function getAttendanceSheet(tutorUser, sessionId) {
  const session = await repository.findSessionWithClass(sessionId);
  if (!session) {
    throw ApiError.notFound('Class session not found.');
  }
  await assertTutorOwnsClass(tutorUser, { tutor_id: session.tutor_id });

  // who is enrolled and what is already marked
  const students = await repository.listActiveStudentsForClass(session.class_id);
  const existingRecords = await repository.listAttendanceForSession(sessionId);

  // marks by student, for quick lookup
  const recordsByStudentId = new Map();
  existingRecords.forEach((record) => {
    recordsByStudentId.set(record.student_id, record);
  });

  // one row per student
  const sheetRows = students.map((student) => {
    const existing = recordsByStudentId.get(student.student_id);
    return {
      studentId: student.student_id,
      studentName: student.student_name,
      studentCode: student.student_code,
      profilePictureUrl: student.profile_picture_path,
      status: existing ? existing.status : null,
      remarks: existing ? existing.remarks : '',
      alreadyMarked: Boolean(existing),
    };
  });

  return {
    session: {
      id: session.id,
      classId: session.class_id,
      subject: session.subject,
      level: session.level,
      isToday: session.session_date === todayDateString(),
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
    },
    students: sheetRows,
  };
}

// save attendance sheet
async function markSessionAttendance(tutorUser, sessionId, records) {
  const session = await repository.findSessionWithClass(sessionId);
  if (!session) {
    throw ApiError.notFound('Class session not found.');
  }
  await assertTutorOwnsClass(tutorUser, { tutor_id: session.tutor_id });

  if (!Array.isArray(records) || records.length === 0) {
    throw ApiError.badRequest('No attendance entries were provided.');
  }

  // only enrolled students can be marked
  const enrolledStudents = await repository.listActiveStudentsForClass(session.class_id);
  const enrolledStudentIds = new Set(enrolledStudents.map((student) => student.student_id));
  const hasUnenrolledStudent = records.some((record) => !enrolledStudentIds.has(record.studentId));
  if (hasUnenrolledStudent) {
    throw ApiError.badRequest('One or more students are not enrolled in this class.');
  }

  // save each mark - new ones are created, existing ones are corrected and audited
  let createdCount = 0;
  let updatedCount = 0;
  // students to tell: newly marked absent, or an absent mark that was corrected
  const markedAbsent = [];
  const absenceCorrected = [];

  for (const record of records) {
    const existing = await repository.findAttendanceRecord(sessionId, record.studentId);

    // nothing changed for this student - leave the record (and the audit log) alone
    if (
      existing &&
      existing.status === record.status &&
      String(existing.remarks || '') === String(record.remarks || '')
    ) {
      continue;
    }

    const wasAbsent = existing && existing.status === 'ABSENT';
    if (record.status === 'ABSENT' && !wasAbsent) markedAbsent.push(record.studentId);
    if (wasAbsent && record.status !== 'ABSENT') absenceCorrected.push({ studentId: record.studentId, status: record.status });

    if (existing) {
      await repository.updateAttendanceRecord(existing.id, {
        status: record.status,
        remarks: record.remarks,
        markedBy: tutorUser.id,
      });
      updatedCount += 1;
      await recordAuditEvent({
        actorId: tutorUser.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'attendance_record',
        entityId: existing.id,
        details: { previousStatus: existing.status, newStatus: record.status },
      });
    } else {
      await repository.createAttendanceRecord({
        sessionId,
        studentId: record.studentId,
        status: record.status,
        remarks: record.remarks,
        markedBy: tutorUser.id,
      });
      createdCount += 1;
    }
  }

  // audit log - one entry for the whole sheet (only when something changed)
  if (createdCount + updatedCount > 0) await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'ATTENDANCE_MARKED',
    entityType: 'class_session',
    entityId: sessionId,
    details: { createdCount, updatedCount },
  });

  // tell the students (bell and email) - a mail problem never stops the save
  const day = new Date(`${String(session.session_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  for (const studentId of markedAbsent) {
    await createNotification({
      recipientId: studentId,
      type: 'ABSENCE_MARKED',
      message:
        `You were marked absent from ${session.subject} on ${day}. ` +
        'If you were there, please speak to your tutor so it can be corrected.',
      link: '/attendance/history',
      sentBy: tutorUser.id,
    }).catch(() => {});
  }
  for (const { studentId, status } of absenceCorrected) {
    await createNotification({
      recipientId: studentId,
      type: 'ABSENCE_MARKED',
      message: `Your attendance for ${session.subject} on ${day} was corrected to ${status.toLowerCase()}.`,
      link: '/attendance/history',
      sentBy: tutorUser.id,
    }).catch(() => {});
  }

  return getAttendanceSheet(tutorUser, sessionId);
}

// attendance rate per class, flagged when under the low-attendance limit (80% by default)
function withLowAttendanceFlag(summaryRows) {
  const threshold = config.business.lowAttendanceThresholdPercent;
  return summaryRows.map((row) => {
    const total = Number(row.total_sessions) || 0;
    const attended = Number(row.attended_sessions) || 0;
    const attendanceRatePercent = total === 0 ? 100 : Math.round((attended / total) * 100);
    return {
      classId: row.class_id,
      subject: row.subject,
      totalSessions: total,
      attendedSessions: attended,
      attendanceRatePercent,
      isLowAttendance: attendanceRatePercent < threshold,
      lowAttendanceThresholdPercent: threshold,
    };
  });
}

// student view - every mark plus the rate per class
async function getMyAttendanceHistory(studentUser, classId) {
  const history = await repository.listAttendanceHistoryForStudent(studentUser.id, classId);
  const summary = await repository.getAttendanceSummaryByClass(studentUser.id);
  return {
    history,
    summaryByClass: withLowAttendanceFlag(summary),
  };
}

// tutor view - one student's marks in one class
async function getStudentAttendanceHistoryForTutor(tutorUser, studentId, classId) {
  if (!classId) {
    throw ApiError.badRequest('A classId is required to view a specific student record.');
  }
  const classRow = await repository.findClassById(classId);
  await assertTutorOwnsClass(tutorUser, classRow);

  const isEnrolled = await repository.isStudentEnrolledInClass(studentId, classId);
  if (!isEnrolled) {
    throw ApiError.notFound('That student is not enrolled in this class.');
  }

  const history = await repository.listAttendanceHistoryForStudent(studentId, classId);
  return { history };
}

module.exports = {
  getMyTaughtClasses,
  listClassSessions,
  getOrCreateTodaySession,
  getAttendanceSheet,
  markSessionAttendance,
  startSelfCheckIn,
  selfCheckIn,
  getMyAttendanceHistory,
  getStudentAttendanceHistoryForTutor,
};
