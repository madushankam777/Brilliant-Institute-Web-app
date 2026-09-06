// HTTP layer for attendance routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./attendance.service');

const listClassSessions = asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId);
  const data = await service.listClassSessions(req.user, classId);
  res.status(200).json({ success: true, data });
});

const getAttendanceSheet = asyncHandler(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const data = await service.getAttendanceSheet(req.user, sessionId);
  res.status(200).json({ success: true, data });
});

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

const getMyHistory = asyncHandler(async (req, res) => {
  const classId = req.query.classId ? Number(req.query.classId) : undefined;
  const data = await service.getMyAttendanceHistory(req.user, classId);
  res.status(200).json({ success: true, data });
});

const getStudentHistoryForTutor = asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  const classId = req.query.classId ? Number(req.query.classId) : undefined;
  const data = await service.getStudentAttendanceHistoryForTutor(req.user, studentId, classId);
  res.status(200).json({ success: true, data });
});

module.exports = {
  listClassSessions,
  getAttendanceSheet,
  markAttendance,
  getMyHistory,
  getStudentHistoryForTutor,
};
