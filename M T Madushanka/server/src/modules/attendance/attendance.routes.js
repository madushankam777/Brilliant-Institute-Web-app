// Route table, mounted at /api/attendance
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validateRequest = require('../../middleware/validateRequest');
const { ROLES } = require('../../config/roles');
const controller = require('./attendance.controller');
const {
  classIdParamRules,
  sessionIdParamRules,
  markAttendanceRules,
  historyQueryRules,
} = require('./attendance.validation');

const router = express.Router();

router.use(authenticate);

// --- Tutor/Admin: manage attendance for their own classes ---
router.get(
  '/classes/:classId/sessions',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  classIdParamRules,
  validateRequest,
  controller.listClassSessions
);

router.get(
  '/sessions/:sessionId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  sessionIdParamRules,
  validateRequest,
  controller.getAttendanceSheet
);

router.post(
  '/sessions/:sessionId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  markAttendanceRules,
  validateRequest,
  controller.markAttendance
);

router.get(
  '/students/:studentId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  historyQueryRules,
  validateRequest,
  controller.getStudentHistoryForTutor
);

// --- Student/Parent: view their own attendance history ---
router.get(
  '/me',
  authorize(ROLES.STUDENT_PARENT),
  historyQueryRules,
  validateRequest,
  controller.getMyHistory
);

module.exports = router;
