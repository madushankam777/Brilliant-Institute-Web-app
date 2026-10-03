// HTTP layer for attendance routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./attendance.service');

// GET /api/attendance/my-classes - the classes this tutor teaches (all for an admin)
const getMyTaughtClasses = asyncHandler(async (req, res) => {
  const classes = await service.getMyTaughtClasses(req.user);
  res.status(200).json({ success: true, data: { classes } });
});

// GET /classes/:classId/sessions - the sessions of one class
const listClassSessions = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const data = await service.listClassSessions(req.user, classId);
  res.status(200).json({ success: true, data });
});

// POST /classes/:classId/today-session - find or make today's session
const getOrCreateTodaySession = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const data = await service.getOrCreateTodaySession(req.user, classId);
  res.status(200).json({ success: true, data });
});

// GET /sessions/:sessionId - the attendance sheet
const getAttendanceSheet = asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const data = await service.getAttendanceSheet(req.user, sessionId);
  res.status(200).json({ success: true, data });
});

// POST /sessions/:sessionId - save the attendance sheet
const markAttendance = asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { records } = req.body;
  const data = await service.markSessionAttendance(req.user, sessionId, records);
  res.status(200).json({
    success: true,
    message: 'Attendance saved successfully.',
    data,
  });
});

// POST /sessions/:sessionId/checkin/start - make a new 6-digit attendance key
const startSelfCheckIn = asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const data = await service.startSelfCheckIn(req.user, sessionId);
  res.status(200).json({ success: true, data });
});

// student enters the key
const selfCheckIn = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const result = await service.selfCheckIn(req.user, code);
  res.status(200).json({
    success: true,
    message: result.alreadyCheckedIn
      ? `You were already checked in to ${result.subject}.`
      : `Checked in to ${result.subject}. See you in class!`,
    data: result,
  });
});

// GET /me - my attendance history
const getMyHistory = asyncHandler(async (req, res) => {
  const classId = req.query.classId ? Number(req.query.classId) : undefined;
  const data = await service.getMyAttendanceHistory(req.user, classId);
  res.status(200).json({ success: true, data });
});

// GET /students/:studentId - one student's history (tutor view)
const getStudentHistoryForTutor = asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  const classId = req.query.classId ? Number(req.query.classId) : undefined;
  const data = await service.getStudentAttendanceHistoryForTutor(req.user, studentId, classId);
  res.status(200).json({ success: true, data });
});

module.exports = {
  getMyTaughtClasses,
  listClassSessions,
  getOrCreateTodaySession,
  getAttendanceSheet,
  markAttendance,
  startSelfCheckIn,
  selfCheckIn,
  getMyHistory,
  getStudentHistoryForTutor,
};
