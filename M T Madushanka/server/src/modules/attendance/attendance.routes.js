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

// every attendance route needs a logged-in user
router.use(authenticate);

// --- Tutor/Admin: manage attendance for their own classes ---
// class picker - the classes this tutor teaches (all classes for an admin)
router.get(
  '/my-classes',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  controller.getMyTaughtClasses
);

// sessions of one class
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

// attendance sheet - the students of a session with their marks
router.get(
  '/sessions/:sessionId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  sessionIdParamRules,
  validateRequest,
  controller.getAttendanceSheet
);

// save attendance btn - save the whole sheet
router.post(
  '/sessions/:sessionId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  markAttendanceRules,
  validateRequest,
  controller.markAttendance
);

// one student's attendance history (tutor view)
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
// my attendance history and the rate per class
router.get(
  '/me',
  authorize(ROLES.STUDENT_PARENT),
  historyQueryRules,
  validateRequest,
  controller.getMyHistory
);

// check in btn - the student enters the 6-digit key (10 tries per 10 minutes)
router.post(
  '/checkin',
  authorize(ROLES.STUDENT_PARENT),
  checkinLimiter,
  selfCheckInRules,
  validateRequest,
  controller.selfCheckIn
);

module.exports = router;
