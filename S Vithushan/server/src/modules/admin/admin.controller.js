// admin controller - reads the request, calls the admin service and sends the JSON reply
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { saveUpload, deleteUpload, sendUpload } = require('../../../../../shared/server/src/utils/fileStore');
const service = require('./admin.service');
const rollover = require('./yearlyRollover');

// GET /admin/dashboard - the dashboard numbers
const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await service.getDashboardStats();
  res.status(200).json({ success: true, data: { stats } });
});

// GET /admin/revenue - revenue by day, month or year
const getRevenueReport = asyncHandler(async (req, res) => {
  const report = await service.getRevenueReport(req.query.period || 'monthly');
  res.status(200).json({ success: true, data: { report } });
});

// --- Tutor: scheduled reminders ---
const listMyReminders = asyncHandler(async (req, res) => {
  const reminders = await service.listMyReminders(req.user);
  res.status(200).json({ success: true, data: { reminders } });
});

// POST /tutor/reminders - schedule a reminder
const scheduleReminder = asyncHandler(async (req, res) => {
  const result = await service.scheduleReminder(req.user, req.body);
  res.status(201).json({
    success: true,
    message:
      req.body.audience === 'SELF'
        ? 'Reminder set. It will appear in your notifications at that time.'
        : `Reminder set for ${result.recipientCount} student(s).`,
    data: { result },
  });
});

// DELETE /tutor/reminders/:reminderId - cancel a reminder
const cancelReminder = asyncHandler(async (req, res) => {
  await service.cancelReminder(req.user, Number(req.params.reminderId));
  res.status(200).json({ success: true, message: 'Reminder cancelled.' });
});

// GET /admin/users - the user list
const listUsers = asyncHandler(async (req, res) => {
  const { search, role, status } = req.query;
  const users = await service.listUsers({ search, role, status });
  res.status(200).json({ success: true, data: { users } });
});

// POST /admin/users - create a tutor or admin account
const createUser = asyncHandler(async (req, res) => {
  const { fullName, email, password, role } = req.body;
  const user = await service.createUser(req.user, { fullName, email, password, role });
  res.status(201).json({ success: true, message: 'Account created successfully.', data: { user } });
});

// GET /admin/users/:userId - one user's profile
const getUserProfile = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await service.getUserProfile(userId);
  res.status(200).json({ success: true, data: { user } });
});

// one-time password reset link the office hands to the user in person
const createPasswordResetLink = asyncHandler(async (req, res) => {
  const data = await service.createPasswordResetLink(req.user, Number(req.params.userId));
  res.status(201).json({ success: true, data });
});

// POST /admin/tutor-keys - make a key and save the uploaded CV and certificates
const generateTutorKey = asyncHandler(async (req, res) => {
  const { intendedFor, idNumber, sendToEmail } = req.body;
  const files = req.files || {};
  // save the uploaded CV and certificates first
  const cvPath = files.cv && files.cv[0] ? await saveUpload(files.cv[0], 'TUTOR_DOCUMENT', req.user.id) : null;
  const certificatePaths = [];
  for (const file of files.certificates || []) {
    certificatePaths.push(await saveUpload(file, 'TUTOR_DOCUMENT', req.user.id));
  }

  let key;
  try {
    key = await service.generateTutorKey(req.user, { intendedFor, idNumber, cvPath, certificatePaths, sendToEmail });
  } catch (error) {
    // key not made - don't keep the documents
    await Promise.all([cvPath, ...certificatePaths].filter(Boolean).map(deleteUpload));
    throw error;
  }
  res.status(201).json({
    success: true,
    message: key.emailedTo
      ? `Enrollment key generated and emailed to ${key.emailedTo}.`
      : 'Enrollment key generated. Copy it now - it will not be shown again.',
    data: { key },
  });
});

// GET /admin/tutor-keys - all keys
const listTutorKeys = asyncHandler(async (req, res) => {
  const keys = await service.listTutorKeys();
  res.status(200).json({ success: true, data: { keys } });
});

// PATCH /admin/tutor-keys/:keyId/revoke - cancel a key
const revokeTutorKey = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  await service.revokeTutorKey(req.user, keyId);
  res.status(200).json({ success: true, message: 'Enrollment key revoked.' });
});

// DELETE /admin/tutor-keys/:keyId - remove a key
const deleteTutorKey = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  await service.deleteTutorKey(req.user, keyId);
  res.status(200).json({ success: true, message: 'Enrollment key deleted.' });
});

// GET /admin/tutor-keys/:keyId/documents/:type - send the CV or a certificate
const downloadTutorKeyDocument = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  const { type } = req.params;
  const certificateMatch = /^certificate-(\d+)$/.exec(type);
  const documentType = certificateMatch ? 'certificate' : type;
  const index = certificateMatch ? Number(certificateMatch[1]) : undefined;

  const publicPath = await service.getTutorKeyDocumentPath(keyId, documentType, index);
  await sendUpload(res, publicPath, 'TUTOR_DOCUMENT');
});

// PATCH /admin/users/:userId/suspend - suspend an account
const suspendUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const { confirmName } = req.body;
  const user = await service.suspendUser(req.user, userId, confirmName);
  res.status(200).json({ success: true, message: 'User suspended.', data: { user } });
});

// PATCH /admin/users/:userId/activate - reopen an account
const activateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await service.activateUser(req.user, userId);
  res.status(200).json({ success: true, message: 'User reactivated.', data: { user } });
});

// DELETE /admin/users/:userId - delete a suspended account
const deleteUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  await service.deleteUser(req.user, userId);
  res.status(200).json({ success: true, message: 'User deleted.' });
});

// GET /students/mine - a tutor's students
const listMyStudents = asyncHandler(async (req, res) => {
  const students = await service.listMyStudents(req.user);
  res.status(200).json({ success: true, data: { students } });
});

// POST /admin/announcements - publish an announcement
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, priority, targetAudience, targetGrade } = req.body;
  const announcement = await service.createAnnouncement(req.user, {
    title,
    body,
    priority,
    targetAudience,
    targetGrade,
  });
  res.status(201).json({ success: true, message: 'Announcement published.', data: { announcement } });
});

// PATCH /admin/announcements/:announcementId - edit an announcement
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcementId = Number(req.params.announcementId);
  const { title, body, priority, targetAudience, targetGrade } = req.body;
  const announcement = await service.updateAnnouncement(req.user, announcementId, {
    title,
    body,
    priority,
    targetAudience,
    targetGrade,
  });
  res.status(200).json({
    success: true,
    message: 'Announcement updated. It will show as updated to everyone it reaches.',
    data: { announcement },
  });
});

// DELETE /admin/announcements/:announcementId - archive an announcement
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcementId = Number(req.params.announcementId);
  await service.deleteAnnouncement(req.user, announcementId);
  res.status(200).json({ success: true, message: 'Announcement removed.' });
});

// GET /admin/announcements - every announcement
const listAllAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await service.listAllAnnouncements();
  res.status(200).json({ success: true, data: { announcements } });
});

// GET /announcements - the announcements for me
const listMyAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await service.listAnnouncementsForUser(req.user);
  res.status(200).json({ success: true, data: { announcements } });
});

// POST /admin/reminders/send - send fee or attendance reminders
const sendReminders = asyncHandler(async (req, res) => {
  const { type, studentIds } = req.body;
  const result = await service.sendReminders(req.user, { type, studentIds });
  res.status(200).json({
    success: true,
    message: `Sent ${result.sentCount} of ${result.recipientCount} reminder(s).`,
    data: { result },
  });
});

// GET /admin/reminders/candidates - who a reminder would reach
const getReminderCandidates = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const candidates = await service.getReminderCandidates(type);
  res.status(200).json({ success: true, data: { candidates } });
});

// POST /notifications/:id/dismiss - clear one notification for good
const dismissMyNotification = asyncHandler(async (req, res) => {
  const stored = await service.dismissMyNotification(req.user, Number(req.params.notificationId));
  res.status(200).json({ success: true, data: { stored } });
});

// POST /announcements/:id/dismiss - clear one announcement (until it is edited again)
const dismissMyAnnouncement = asyncHandler(async (req, res) => {
  const stored = await service.dismissMyAnnouncement(req.user, Number(req.params.announcementId), req.body.version);
  res.status(200).json({ success: true, data: { stored } });
});

// POST /notifications/clear-all - clear the whole bell
const clearMyNotifications = asyncHandler(async (req, res) => {
  const stored = await service.clearMyNotifications(req.user);
  res.status(200).json({ success: true, data: { stored } });
});

// GET /notifications/mine - my notification bell
const listMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await service.listMyNotifications(req.user);
  res.status(200).json({ success: true, data: { notifications } });
});

// tutor -> their own students and/or Admin
const listMyClassesForMessaging = asyncHandler(async (req, res) => {
  const classes = await service.listMyClassesForMessaging(req.user);
  res.status(200).json({ success: true, data: { classes } });
});

// POST /tutor/messages - a tutor messages their students and/or the admin
const sendTutorMessage = asyncHandler(async (req, res) => {
  const result = await service.sendTutorMessage(req.user, req.body);
  res.status(201).json({
    success: true,
    message: `Message sent to ${result.recipientCount} recipient(s).`,
    data: { result },
  });
});

// --- Student re-registration ---
const getReregistrationOptions = asyncHandler(async (req, res) => {
  const options = await service.getReregistrationOptions();
  res.status(200).json({ success: true, data: { options } });
});

// Key codes are returned here and nowhere else - no later listing includes them.
const generateReregistrationKeys = asyncHandler(async (req, res) => {
  const result = await service.generateReregistrationKeys(req.user, req.body);
  const issued = result.issued.length;
  res.status(201).json({
    success: true,
    message:
      issued > 0
        ? `${issued} key(s) created for ${result.academicYear}.`
        : 'No new keys were needed - see the notes below.',
    data: { result },
  });
});

// GET /admin/reregistration-keys - the issued keys
const listReregistrationKeys = asyncHandler(async (req, res) => {
  const keys = await service.listReregistrationKeys(req.query.academicYear);
  res.status(200).json({ success: true, data: { keys } });
});

// PATCH /admin/reregistration-keys/:keyId/revoke - cancel a key
const revokeReregistrationKey = asyncHandler(async (req, res) => {
  await service.revokeReregistrationKey(req.user, Number(req.params.keyId));
  res.status(200).json({ success: true, message: 'Re-registration key revoked.' });
});

// DELETE /admin/reregistration-keys/:keyId - remove a key
const deleteReregistrationKey = asyncHandler(async (req, res) => {
  await service.deleteReregistrationKey(req.user, Number(req.params.keyId));
  res.status(200).json({ success: true, message: 'Re-registration key deleted.' });
});

// POST /reregistration/redeem - the student's key confirms their place
const redeemReregistrationKey = asyncHandler(async (req, res) => {
  const result = await service.redeemReregistrationKey(req.user, req.body.keyCode);
  res.status(200).json({ success: true, message: result.message, data: { result } });
});

// GET /reregistration/mine - my re-registration status
const getMyReregistrationStatus = asyncHandler(async (req, res) => {
  const status = await service.getMyReregistrationStatus(req.user);
  res.status(200).json({ success: true, data: { status } });
});

// preview who moves up and who leaves
const previewYearlyRollover = asyncHandler(async (req, res) => {
  const preview = await rollover.previewRollover(req.query.academicYear);
  res.status(200).json({ success: true, data: { preview } });
});

// POST /admin/reregistration/rollover - run the roll-over
const runYearlyRollover = asyncHandler(async (req, res) => {
  const result = await rollover.runYearlyRollover({
    academicYear: req.body.academicYear,
    actorId: req.user.id,
  });
  res.status(200).json({
    success: true,
    message: result.skipped
      ? `The ${result.academicYear} roll-over has already been run.`
      : `Promoted ${result.promotedCount}, graduated ${result.graduatedCount}, closed ${result.removedCount}.`,
    data: { result },
  });
});

module.exports = {
  getDashboardStats,
  getRevenueReport,
  listMyReminders,
  scheduleReminder,
  cancelReminder,
  previewYearlyRollover,
  runYearlyRollover,
  getReregistrationOptions,
  generateReregistrationKeys,
  listReregistrationKeys,
  revokeReregistrationKey,
  deleteReregistrationKey,
  redeemReregistrationKey,
  getMyReregistrationStatus,
  listUsers,
  createUser,
  getUserProfile,
  createPasswordResetLink,
  generateTutorKey,
  listTutorKeys,
  revokeTutorKey,
  deleteTutorKey,
  downloadTutorKeyDocument,
  suspendUser,
  activateUser,
  deleteUser,
  listMyStudents,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  listMyAnnouncements,
  sendReminders,
  getReminderCandidates,
  listMyNotifications,
  dismissMyNotification,
  dismissMyAnnouncement,
  clearMyNotifications,
  listMyClassesForMessaging,
  sendTutorMessage,
};
