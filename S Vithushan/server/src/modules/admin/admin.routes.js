const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { tutorDocumentsUpload } = require('../../../../../shared/server/src/middleware/upload');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
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

// --- Tutor only: their own student roster ---
router.get('/students/mine', authorize(ROLES.TUTOR), controller.listMyStudents);

// --- Admin only: everything below ---
router.use('/admin', authorize(ROLES.ADMIN));

router.get('/admin/dashboard', controller.getDashboardStats);

router.get('/admin/users', listUsersQueryRules, validateRequest, controller.listUsers);
router.post('/admin/users', createUserRules, validateRequest, controller.createUser);
router.get(
  '/admin/users/:userId',
  userIdParamRules,
  validateRequest,
  controller.getUserProfile
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
