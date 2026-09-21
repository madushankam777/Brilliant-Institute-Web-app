const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./course.controller');
const {
  classIdParamRules,
  enrollmentIdParamRules,
  deleteEnrollmentRecordRules,
  tutorIdParamRules,
  browseQueryRules,
  createClassRules,
  updateClassRules,
} = require('./course.validation');

const router = express.Router();

router.use(authenticate);

// --- Browse (any logged-in role) ---
router.get('/classes', browseQueryRules, validateRequest, controller.browseClasses);
router.get('/classes/:classId', classIdParamRules, validateRequest, controller.getClassDetails);
router.get('/tutors', controller.listTutors);
router.get('/tutors/:tutorId', tutorIdParamRules, validateRequest, controller.getTutorProfile);

// --- Tutor / Admin: manage their own classes ---
router.get(
  '/my-classes',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  controller.listMyTaughtClasses
);
// Only Admin creates classes - tutors edit the ones assigned to them.
router.post(
  '/classes',
  authorize(ROLES.ADMIN),
  createClassRules,
  validateRequest,
  controller.createClass
);
router.put(
  '/classes/:classId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  updateClassRules,
  validateRequest,
  controller.updateClass
);
router.delete(
  '/classes/:classId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  classIdParamRules,
  validateRequest,
  controller.cancelClass
);

// --- Student / Parent: enrol, drop, "My Courses" ---
router.post(
  '/classes/:classId/enroll',
  authorize(ROLES.STUDENT_PARENT),
  classIdParamRules,
  validateRequest,
  controller.enrollInClass
);
router.get('/my-courses', authorize(ROLES.STUDENT_PARENT), controller.listMyCourses);
router.delete(
  '/my-courses/:enrollmentId',
  authorize(ROLES.STUDENT_PARENT),
  enrollmentIdParamRules,
  validateRequest,
  controller.dropClass
);
router.delete(
  '/my-courses/:enrollmentId/permanent',
  authorize(ROLES.STUDENT_PARENT),
  deleteEnrollmentRecordRules,
  validateRequest,
  controller.deleteEnrollmentRecord
);

module.exports = router;
