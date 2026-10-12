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

// mark attendance btn - find or make today's session for a class
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

router.post(
  '/sessions/:sessionId/checkin/start',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  sessionIdParamRules,
  validateRequest,
  controller.startSelfCheckIn
);

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
