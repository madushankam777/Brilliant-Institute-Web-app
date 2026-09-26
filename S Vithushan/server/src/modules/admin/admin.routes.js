const express = require('express');
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

router.use(authenticate);

// --- Any authenticated role: read published announcements + their own
// personal notifications (reminders addressed specifically to them) ---
router.get('/announcements', controller.listMyAnnouncements);
router.get('/notifications/mine', controller.listMyNotifications);

router.patch(
  '/admin/users/:userId/suspend',
  authorize(ROLES.ADMIN, ROLES.TUTOR),
  suspendUserRules,
  validateRequest,
  controller.suspendUser
);
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
router.get('/tutor/my-classes', authorize(ROLES.TUTOR), controller.listMyClassesForMessaging);
router.post(
  '/tutor/messages',
  authorize(ROLES.TUTOR),
  tutorMessageRules,
  validateRequest,
  controller.sendTutorMessage
);

// --- Tutor only: reminders scheduled for a date and time ---
router.get('/tutor/reminders', authorize(ROLES.TUTOR), controller.listMyReminders);
router.post(
  '/tutor/reminders',
  authorize(ROLES.TUTOR),
  scheduleReminderRules,
  validateRequest,
  controller.scheduleReminder
);
router.delete(
  '/tutor/reminders/:reminderId',
  authorize(ROLES.TUTOR),
  reminderIdParamRules,
  validateRequest,
  controller.cancelReminder
);

// --- Admin only: everything below ---
router.use('/admin', authorize(ROLES.ADMIN));

router.get('/admin/dashboard', controller.getDashboardStats);
router.get('/admin/revenue', revenueQueryRules, validateRequest, controller.getRevenueReport);

router.get('/admin/users', listUsersQueryRules, validateRequest, controller.listUsers);
router.post('/admin/users', createUserRules, validateRequest, controller.createUser);
router.get(
  '/admin/users/:userId',
  userIdParamRules,
  validateRequest,
  controller.getUserProfile
);
router.post(
  '/admin/users/:userId/reset-link',
  userIdParamRules,
  validateRequest,
  controller.createPasswordResetLink
);

router.post(
  '/admin/tutor-keys',
  tutorDocumentsUpload,
  generateTutorKeyRules,
  validateRequest,
  controller.generateTutorKey
);
router.get('/admin/tutor-keys', controller.listTutorKeys);
router.patch(
  '/admin/tutor-keys/:keyId/revoke',
  keyIdParamRules,
  validateRequest,
  controller.revokeTutorKey
);
router.delete(
  '/admin/tutor-keys/:keyId',
  keyIdParamRules,
  validateRequest,
  controller.deleteTutorKey
);
router.get(
  '/admin/tutor-keys/:keyId/documents/:type',
  keyDocumentParamRules,
  validateRequest,
  controller.downloadTutorKeyDocument
);

router.get('/admin/reregistration/options', controller.getReregistrationOptions);
router.post(
  '/admin/reregistration-keys',
  generateReregistrationKeysRules,
  validateRequest,
  controller.generateReregistrationKeys
);
router.get(
  '/admin/reregistration-keys',
  reregistrationKeyQueryRules,
  validateRequest,
  controller.listReregistrationKeys
);
router.patch(
  '/admin/reregistration-keys/:keyId/revoke',
  reregistrationKeyIdParamRules,
  validateRequest,
  controller.revokeReregistrationKey
);
router.delete(
  '/admin/reregistration-keys/:keyId',
  reregistrationKeyIdParamRules,
  validateRequest,
  controller.deleteReregistrationKey
);

router.get(
  '/admin/reregistration/rollover',
  rolloverQueryRules,
  validateRequest,
  controller.previewYearlyRollover
);
router.post(
  '/admin/reregistration/rollover',
  runRolloverRules,
  validateRequest,
  controller.runYearlyRollover
);

router.get('/admin/announcements', controller.listAllAnnouncements);
router.post(
  '/admin/announcements',
  createAnnouncementRules,
  validateRequest,
  controller.createAnnouncement
);
router.patch(
  '/admin/announcements/:announcementId',
  updateAnnouncementRules,
  validateRequest,
  controller.updateAnnouncement
);
router.delete(
  '/admin/announcements/:announcementId',
  announcementIdParamRules,
  validateRequest,
  controller.deleteAnnouncement
);

router.get(
  '/admin/reminders/candidates',
  reminderCandidatesQueryRules,
  validateRequest,
  controller.getReminderCandidates
);
router.post('/admin/reminders/send', sendRemindersRules, validateRequest, controller.sendReminders);

module.exports = router;
