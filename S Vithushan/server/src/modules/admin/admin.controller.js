const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { toPublicUploadPath } = require('../../../../../shared/server/src/middleware/upload');
const { resolveUploadPath } = require('../../../../../shared/server/src/utils/resolveUploadPath');
const service = require('./admin.service');
const rollover = require('./yearlyRollover');

const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await service.getDashboardStats();
  res.status(200).json({ success: true, data: { stats } });
});

const getRevenueReport = asyncHandler(async (req, res) => {
  const report = await service.getRevenueReport(req.query.period || 'monthly');
  res.status(200).json({ success: true, data: { report } });
});

// --- Tutor: scheduled reminders ---
const listMyReminders = asyncHandler(async (req, res) => {
  const reminders = await service.listMyReminders(req.user);
  res.status(200).json({ success: true, data: { reminders } });
});

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

const cancelReminder = asyncHandler(async (req, res) => {
  await service.cancelReminder(req.user, Number(req.params.reminderId));
  res.status(200).json({ success: true, message: 'Reminder cancelled.' });
});

const listUsers = asyncHandler(async (req, res) => {
  const { search, role, status } = req.query;
  const users = await service.listUsers({ search, role, status });
  res.status(200).json({ success: true, data: { users } });
});

const createUser = asyncHandler(async (req, res) => {
  const { fullName, email, password, role } = req.body;
  const user = await service.createUser(req.user, { fullName, email, password, role });
  res.status(201).json({ success: true, message: 'Account created successfully.', data: { user } });
});

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

const generateTutorKey = asyncHandler(async (req, res) => {
  const { intendedFor, idNumber } = req.body;
  const files = req.files || {};
  const cvPath = files.cv && files.cv[0] ? toPublicUploadPath(files.cv[0].path) : null;
  const certificatePaths = (files.certificates || []).map((file) => toPublicUploadPath(file.path));

  const key = await service.generateTutorKey(req.user, {
    intendedFor,
    idNumber,
    cvPath,
    certificatePaths,
  });
  res.status(201).json({
    success: true,
    message: 'Enrollment key generated. Copy it now - it will not be shown again.',
    data: { key },
  });
});

const listTutorKeys = asyncHandler(async (req, res) => {
  const keys = await service.listTutorKeys();
  res.status(200).json({ success: true, data: { keys } });
});

const revokeTutorKey = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  await service.revokeTutorKey(req.user, keyId);
  res.status(200).json({ success: true, message: 'Enrollment key revoked.' });
});

const deleteTutorKey = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  await service.deleteTutorKey(req.user, keyId);
  res.status(200).json({ success: true, message: 'Enrollment key deleted.' });
});

const downloadTutorKeyDocument = asyncHandler(async (req, res) => {
  const keyId = Number(req.params.keyId);
  const { type } = req.params;
  const certificateMatch = /^certificate-(\d+)$/.exec(type);
  const documentType = certificateMatch ? 'certificate' : type;
  const index = certificateMatch ? Number(certificateMatch[1]) : undefined;

  const publicPath = await service.getTutorKeyDocumentPath(keyId, documentType, index);
  const absolutePath = resolveUploadPath(publicPath);
  res.sendFile(absolutePath);
});

const suspendUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const { confirmName } = req.body;
  const user = await service.suspendUser(req.user, userId, confirmName);
  res.status(200).json({ success: true, message: 'User suspended.', data: { user } });
});

const activateUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await service.activateUser(req.user, userId);
  res.status(200).json({ success: true, message: 'User reactivated.', data: { user } });
});

const deleteUser = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  await service.deleteUser(req.user, userId);
  res.status(200).json({ success: true, message: 'User deleted.' });
});

const listMyStudents = asyncHandler(async (req, res) => {
  const students = await service.listMyStudents(req.user);
  res.status(200).json({ success: true, data: { students } });
});

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

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcementId = Number(req.params.announcementId);
  await service.deleteAnnouncement(req.user, announcementId);
  res.status(200).json({ success: true, message: 'Announcement removed.' });
});

const listAllAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await service.listAllAnnouncements();
  res.status(200).json({ success: true, data: { announcements } });
});

const listMyAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await service.listAnnouncementsForUser(req.user);
  res.status(200).json({ success: true, data: { announcements } });
});

const sendReminders = asyncHandler(async (req, res) => {
  const { type, studentIds } = req.body;
  const result = await service.sendReminders(req.user, { type, studentIds });
  res.status(200).json({
    success: true,
    message: `Sent ${result.sentCount} of ${result.recipientCount} reminder(s).`,
    data: { result },
  });
});

const getReminderCandidates = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const candidates = await service.getReminderCandidates(type);
  res.status(200).json({ success: true, data: { candidates } });
});

const listMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await service.listMyNotifications(req.user);
  res.status(200).json({ success: true, data: { notifications } });
});

// tutor -> their own students and/or Admin
const listMyClassesForMessaging = asyncHandler(async (req, res) => {
  const classes = await service.listMyClassesForMessaging(req.user);
  res.status(200).json({ success: true, data: { classes } });
});

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

const listReregistrationKeys = asyncHandler(async (req, res) => {
  const keys = await service.listReregistrationKeys(req.query.academicYear);
  res.status(200).json({ success: true, data: { keys } });
});

const revokeReregistrationKey = asyncHandler(async (req, res) => {
  await service.revokeReregistrationKey(req.user, Number(req.params.keyId));
  res.status(200).json({ success: true, message: 'Re-registration key revoked.' });
});

const redeemReregistrationKey = asyncHandler(async (req, res) => {
  const result = await service.redeemReregistrationKey(req.user, req.body.keyCode);
  res.status(200).json({ success: true, message: result.message, data: { result } });
});

const getMyReregistrationStatus = asyncHandler(async (req, res) => {
  const status = await service.getMyReregistrationStatus(req.user);
  res.status(200).json({ success: true, data: { status } });
});

// Shows exactly who would move up and whose account would close, before
// anything is changed.
const previewYearlyRollover = asyncHandler(async (req, res) => {
  const preview = await rollover.previewRollover(req.query.academicYear);
  res.status(200).json({ success: true, data: { preview } });
});

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
  listMyClassesForMessaging,
  sendTutorMessage,
};
