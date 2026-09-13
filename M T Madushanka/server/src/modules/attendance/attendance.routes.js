// Route table, mounted at /api/attendance
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { checkinLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./attendance.controller');
const {
  classIdParamRules,
  sessionIdParamRules,
  markAttendanceRules,
  historyQueryRules,
  selfCheckInRules,
} = require('./attendance.validation');

const router = express.Router();

router.use(authenticate);

// --- Tutor/Admin: manage attendance for their own classes ---
router.get(
  '/my-classes',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  controller.getMyTaughtClasses
);

router.get(
  '/classes/:classId/sessions',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  classIdParamRules,
  validateRequest,
  controller.listClassSessions
);

router.post(
  '/classes/:classId/today-session',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  classIdParamRules,
  validateRequest,
  controller.getOrCreateTodaySession
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

// generate key btn - tutor/admin makes a fresh attendance key for this session
router.post(
  '/sessions/:sessionId/checkin/start',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  sessionIdParamRules,
  validateRequest,
  controller.startSelfCheckIn
);

// --- Student/Parent: view their own attendance history + self check-in ---
router.get(
  '/me',
  authorize(ROLES.STUDENT_PARENT),
  historyQueryRules,
  validateRequest,
  controller.getMyHistory
);

router.post(
  '/checkin',
  authorize(ROLES.STUDENT_PARENT),
  checkinLimiter,
  selfCheckInRules,
  validateRequest,
  controller.selfCheckIn
);

module.exports = router;
