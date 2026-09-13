// Attendance business logic
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafeClass } = require('../../../../../shared/server/src/utils/sanitize');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const repository = require('./attendance.repository');

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

async function listClassSessions(tutorUser, classId) {
  const classRow = await repository.findClassById(classId);
  await assertTutorOwnsClass(tutorUser, classRow);
  const sessions = await repository.listSessionsForClass(classId);
  return { classSubject: classRow.subject, sessions };
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// mark attendance btn - find or make today's session
async function getOrCreateTodaySession(tutorUser, classId) {
  const classRow = await repository.findClassById(classId);
  await assertTutorOwnsClass(tutorUser, classRow);
  if (classRow.status !== 'ACTIVE') {
    throw ApiError.badRequest('This class has been cancelled.');
  }

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

async function getAttendanceSheet(tutorUser, sessionId) {
  const session = await repository.findSessionWithClass(sessionId);
  if (!session) {
    throw ApiError.notFound('Class session not found.');
  }
  await assertTutorOwnsClass(tutorUser, { tutor_id: session.tutor_id });

  const students = await repository.listActiveStudentsForClass(session.class_id);
  const existingRecords = await repository.listAttendanceForSession(sessionId);

  const recordsByStudentId = new Map();
  existingRecords.forEach((record) => {
    recordsByStudentId.set(record.student_id, record);
  });

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

  const enrolledStudents = await repository.listActiveStudentsForClass(session.class_id);
  const enrolledStudentIds = new Set(enrolledStudents.map((student) => student.student_id));
  const hasUnenrolledStudent = records.some((record) => !enrolledStudentIds.has(record.studentId));
  if (hasUnenrolledStudent) {
    throw ApiError.badRequest('One or more students are not enrolled in this class.');
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const record of records) {
    const existing = await repository.findAttendanceRecord(sessionId, record.studentId);

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

  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'ATTENDANCE_MARKED',
    entityType: 'class_session',
    entityId: sessionId,
    details: { createdCount, updatedCount },
  });

  return getAttendanceSheet(tutorUser, sessionId);
}

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

async function getMyAttendanceHistory(studentUser, classId) {
  const history = await repository.listAttendanceHistoryForStudent(studentUser.id, classId);
  const summary = await repository.getAttendanceSummaryByClass(studentUser.id);
  return {
    history,
    summaryByClass: withLowAttendanceFlag(summary),
  };
}

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
  getMyAttendanceHistory,
  getStudentAttendanceHistoryForTutor,
};
