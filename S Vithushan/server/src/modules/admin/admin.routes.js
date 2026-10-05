// admin routes - users, tutor keys, re-registration, announcements and reminders (mounted at /api)
const express = require('express');
const { param, body } = require('express-validator');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { tutorDocumentsUpload } = require('../../../../../shared/server/src/middleware/upload');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const { keyRedemptionLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const controller = require('./admin.controller');
const {
  userIdParamRules,
  createUserRules,
  keyIdParamRules,
  generateTutorKeyRules,
  keyDocumentParamRules,
  suspendUserRules,
  listUsersQueryRules,
  announcementIdParamRules,
  createAnnouncementRules,
  updateAnnouncementRules,
  sendRemindersRules,
  reminderCandidatesQueryRules,
  tutorMessageRules,
  generateReregistrationKeysRules,
  revenueQueryRules,
  scheduleReminderRules,
  reminderIdParamRules,
  reregistrationKeyIdParamRules,
  reregistrationKeyQueryRules,
  redeemReregistrationKeyRules,
  rolloverQueryRules,
  runRolloverRules,
} = require('./admin.validation');

const router = express.Router();

// every route here needs a logged-in user
router.use(authenticate);

// --- Any authenticated role: read published announcements + their own
// personal notifications (reminders addressed specifically to them) ---
router.get('/announcements', controller.listMyAnnouncements);
// notification bell - my personal notifications
router.get('/notifications/mine', controller.listMyNotifications);
// clear all btn - every notification in my bell, on every device
router.post('/notifications/clear-all', controller.clearMyNotifications);
// clear btn - one of my notifications
router.post(
  '/notifications/:notificationId/dismiss',
  param('notificationId').isInt({ min: 1 }).withMessage('Invalid notification id.'),
  validateRequest,
  controller.dismissMyNotification
);
// clear btn - one announcement (it comes back if it is edited)
router.post(
  '/announcements/:announcementId/dismiss',
  param('announcementId').isInt({ min: 1 }).withMessage('Invalid announcement id.'),
  body('version').optional().isInt({ min: 1 }).withMessage('Invalid version.'),
  validateRequest,
  controller.dismissMyAnnouncement
);

// suspend btn - an admin, or a tutor for their own students
router.patch(
  '/admin/users/:userId/suspend',
  authorize(ROLES.ADMIN, ROLES.TUTOR),
  suspendUserRules,
  validateRequest,
  controller.suspendUser
);
// activate btn - reopen a suspended account
router.patch(
  '/admin/users/:userId/activate',
  authorize(ROLES.ADMIN, ROLES.TUTOR),
  userIdParamRules,
  validateRequest,
  controller.activateUser
);
// only an Admin may delete - and only once the account is already suspended
router.delete(
  '/admin/users/:userId',
  authorize(ROLES.ADMIN),
  userIdParamRules,
  validateRequest,
  controller.deleteUser
);

// --- Student only: redeem the key the office gave them ---
router.get(
  '/reregistration/mine',
  authorize(ROLES.STUDENT_PARENT),
  controller.getMyReregistrationStatus
);
// re-register btn - the student types the key the office gave them (10 tries per 15 minutes)
router.post(
  '/reregistration/redeem',
  authorize(ROLES.STUDENT_PARENT),
  keyRedemptionLimiter,
  redeemReregistrationKeyRules,
  validateRequest,
  controller.redeemReregistrationKey
);

// --- Tutor only: their own student roster + messaging their own students ---
router.get('/students/mine', authorize(ROLES.TUTOR), controller.listMyStudents);
// tutor - my classes, for picking who a message goes to
router.get('/tutor/my-classes', authorize(ROLES.TUTOR), controller.listMyClassesForMessaging);
// send message btn - a tutor messages their students and/or the admin
router.post(
  '/tutor/messages',
  authorize(ROLES.TUTOR),
  tutorMessageRules,
  validateRequest,
  controller.sendTutorMessage
);

// --- Tutor only: reminders scheduled for a date and time ---
router.get('/tutor/reminders', authorize(ROLES.TUTOR), controller.listMyReminders);
// schedule btn - a tutor sets a reminder for a date and time
router.post(
  '/tutor/reminders',
  authorize(ROLES.TUTOR),
  scheduleReminderRules,
  validateRequest,
  controller.scheduleReminder
);
// cancel btn - remove a reminder that has not been sent yet
router.delete(
  '/tutor/reminders/:reminderId',
  authorize(ROLES.TUTOR),
  reminderIdParamRules,
  validateRequest,
  controller.cancelReminder
);

// --- Admin only: everything below ---
router.use('/admin', authorize(ROLES.ADMIN));

// admin dashboard - counts, revenue trend and recent activity
router.get('/admin/dashboard', controller.getDashboardStats);
// revenue report - daily, monthly, yearly or 5 years
router.get('/admin/revenue', revenueQueryRules, validateRequest, controller.getRevenueReport);

// user list with search and filters
router.get('/admin/users', listUsersQueryRules, validateRequest, controller.listUsers);
// add user btn - create a tutor or admin account
router.post('/admin/users', createUserRules, validateRequest, controller.createUser);
// one user's profile (a tutor's also shows the key documents)
router.get(
  '/admin/users/:userId',
  userIdParamRules,
  validateRequest,
  controller.getUserProfile
);
// reset link btn - make a one-time password reset link for a user
router.post(
  '/admin/users/:userId/reset-link',
  userIdParamRules,
  validateRequest,
  controller.createPasswordResetLink
);

// generate key btn - make a new tutor enrollment key, with the tutor's CV and certificates
router.post(
  '/admin/tutor-keys',
  tutorDocumentsUpload,
  generateTutorKeyRules,
  validateRequest,
  controller.generateTutorKey
);
// all tutor keys
router.get('/admin/tutor-keys', controller.listTutorKeys);
// revoke btn - cancel an unused key
router.patch(
  '/admin/tutor-keys/:keyId/revoke',
  keyIdParamRules,
  validateRequest,
  controller.revokeTutorKey
);
// delete btn - remove a key and its documents
router.delete(
  '/admin/tutor-keys/:keyId',
  keyIdParamRules,
  validateRequest,
  controller.deleteTutorKey
);
// download a key's CV or certificate
router.get(
  '/admin/tutor-keys/:keyId/documents/:type',
  keyDocumentParamRules,
  validateRequest,
  controller.downloadTutorKeyDocument
);

// re-registration page - the students, classes and grades to pick from
router.get('/admin/reregistration/options', controller.getReregistrationOptions);
// issue keys btn - make re-registration keys for students
router.post(
  '/admin/reregistration-keys',
  generateReregistrationKeysRules,
  validateRequest,
  controller.generateReregistrationKeys
);
// the issued re-registration keys (codes are not shown again)
router.get(
  '/admin/reregistration-keys',
  reregistrationKeyQueryRules,
  validateRequest,
  controller.listReregistrationKeys
);
// revoke btn - cancel an unused re-registration key
router.patch(
  '/admin/reregistration-keys/:keyId/revoke',
  reregistrationKeyIdParamRules,
  validateRequest,
  controller.revokeReregistrationKey
);
// delete btn - remove a re-registration key
router.delete(
  '/admin/reregistration-keys/:keyId',
  reregistrationKeyIdParamRules,
  validateRequest,
  controller.deleteReregistrationKey
);

// roll-over preview - who moves up, who graduates and who leaves
router.get(
  '/admin/reregistration/rollover',
  rolloverQueryRules,
  validateRequest,
  controller.previewYearlyRollover
);
// run roll-over btn - move students up a grade and close the accounts of those who did not re-register
router.post(
  '/admin/reregistration/rollover',
  runRolloverRules,
  validateRequest,
  controller.runYearlyRollover
);

// all announcements
router.get('/admin/announcements', controller.listAllAnnouncements);
// publish btn - post an announcement
router.post(
  '/admin/announcements',
  createAnnouncementRules,
  validateRequest,
  controller.createAnnouncement
);
// edit btn - change an announcement
router.patch(
  '/admin/announcements/:announcementId',
  updateAnnouncementRules,
  validateRequest,
  controller.updateAnnouncement
);
// delete btn - archive an announcement
router.delete(
  '/admin/announcements/:announcementId',
  announcementIdParamRules,
  validateRequest,
  controller.deleteAnnouncement
);

// reminder candidates - the students a fee or attendance reminder would reach
router.get(
  '/admin/reminders/candidates',
  reminderCandidatesQueryRules,
  validateRequest,
  controller.getReminderCandidates
);
// send reminders btn - send fee or attendance reminders
router.post('/admin/reminders/send', sendRemindersRules, validateRequest, controller.sendReminders);

module.exports = router;
