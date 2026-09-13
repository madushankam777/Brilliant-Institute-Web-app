const path = require('path');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { UPLOADS_ROOT_DIR, toPublicUploadPath } = require('../../../../../shared/server/src/middleware/upload');
const service = require('./admin.service');

const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await service.getDashboardStats();
  res.status(200).json({ success: true, data: { stats } });
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
  const absolutePath = path.join(UPLOADS_ROOT_DIR, publicPath.replace(/^\/uploads\//, ''));
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

module.exports = {
  getDashboardStats,
  listUsers,
  createUser,
  getUserProfile,
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
};
