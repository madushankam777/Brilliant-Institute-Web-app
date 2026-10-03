// course routes - classes, tutors, enrolment, timetables and class changes (/api/courses)
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
  timetableUserIdRules,
  holidayQueryRules,
  cancelDayRules,
  extraClassRules,
  eventIdParamRules,
  browseQueryRules,
  createClassRules,
  updateClassRules,
} = require('./course.validation');

const router = express.Router();

// public - no login needed (About page)
router.get('/public-tutors', controller.listPublicTutors);

// every route below needs a logged-in user
router.use(authenticate);

// --- Public holidays (Google Calendar), for every calendar on the site ---
router.get('/holidays', holidayQueryRules, validateRequest, controller.listHolidays);

// --- Cancelled days and extra classes ---
// calendar - cancelled days and extra classes between two dates
router.get('/events', holidayQueryRules, validateRequest, controller.listClassEvents);
// cancel btn - cancel one day of a class and tell the students
router.post(
  '/classes/:classId/cancel-day',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  cancelDayRules,
  validateRequest,
  controller.cancelClassDay
);
// extra class btn - add a one-off class and tell the students
router.post(
  '/classes/:classId/extra',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  extraClassRules,
  validateRequest,
  controller.addExtraClass
);
// undo btn - bring back a cancelled day, or remove an extra class
router.delete(
  '/events/:eventId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  eventIdParamRules,
  validateRequest,
  controller.deleteClassEvent
);

// --- Weekly timetable: your own, or (Admin) anyone's ---
router.get('/timetable/me', controller.getMyTimetable);
// admin - anyone's weekly timetable
router.get(
  '/timetable/:userId',
  authorize(ROLES.ADMIN),
  timetableUserIdRules,
  validateRequest,
  controller.getUserTimetable
);

// --- Browse (any logged-in role) ---
router.get('/classes', browseQueryRules, validateRequest, controller.browseClasses);
// one class with its tutor and the number of students enrolled
router.get('/classes/:classId', classIdParamRules, validateRequest, controller.getClassDetails);
// all tutors
router.get('/tutors', controller.listTutors);
// one tutor's profile and the classes they teach
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
// save class btn - edit a class, enrolled students are told what changed
router.put(
  '/classes/:classId',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  updateClassRules,
  validateRequest,
  controller.updateClass
);
// cancel class btn - cancel the whole class and tell the students
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
// my courses - the classes I am enrolled in, including dropped ones
router.get('/my-courses', authorize(ROLES.STUDENT_PARENT), controller.listMyCourses);
// drop btn - leave a class
router.delete(
  '/my-courses/:enrollmentId',
  authorize(ROLES.STUDENT_PARENT),
  enrollmentIdParamRules,
  validateRequest,
  controller.dropClass
);
// delete btn - remove a dropped class from my history (type DELETE to confirm)
router.delete(
  '/my-courses/:enrollmentId/permanent',
  authorize(ROLES.STUDENT_PARENT),
  deleteEnrollmentRecordRules,
  validateRequest,
  controller.deleteEnrollmentRecord
);

module.exports = router;
