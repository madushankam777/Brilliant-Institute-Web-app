// admin API calls - dashboard, users, tutor keys, announcements, reminders and re-registration
import httpClient from '../../../shared/client/src/api/httpClient';

// admin dashboard - counts, revenue trend and recent activity
export async function fetchDashboardStats() {
  const response = await httpClient.get('/admin/dashboard');
  return response.data.data.stats;
}

// period: daily | monthly | yearly | fiveYears
export async function fetchRevenueReport(period) {
  const response = await httpClient.get('/admin/revenue', { params: { period } });
  return response.data.data.report;
}

// user list with search, role and status filters
export async function fetchUsers(filters = {}) {
  const params = {};
  if (filters.search) params.search = filters.search;
  if (filters.role) params.role = filters.role;
  if (filters.status) params.status = filters.status;
  const response = await httpClient.get('/admin/users', { params });
  return response.data.data.users;
}

// add user btn - create a tutor or admin account
export async function createUser(payload) {
  const response = await httpClient.post('/admin/users', payload);
  return response.data.data.user;
}

// one user's profile
export async function fetchUserProfile(userId) {
  const response = await httpClient.get(`/admin/users/${userId}`);
  return response.data.data.user;
}

// suspend btn - must type name to confirm
export async function suspendUser(userId, confirmName) {
  const response = await httpClient.patch(`/admin/users/${userId}/suspend`, { confirmName });
  return response.data.data.user;
}

// activate btn - reopen a suspended account
export async function activateUser(userId) {
  const response = await httpClient.patch(`/admin/users/${userId}/activate`);
  return response.data.data.user;
}

// delete btn - only available once a user is already suspended
export async function deleteUser(userId) {
  await httpClient.delete(`/admin/users/${userId}`);
}

// a tutor's students
export async function fetchMyStudents() {
  const response = await httpClient.get('/students/mine');
  return response.data.data.students;
}

// generate key btn - make a tutor key and upload the tutor's CV and certificates
export async function generateTutorKey({ intendedFor, idNumber, cvFile, certificateFiles, sendToEmail }) {
  const formData = new FormData();
  if (intendedFor) formData.append('intendedFor', intendedFor);
  if (sendToEmail) formData.append('sendToEmail', sendToEmail);
  if (idNumber) formData.append('idNumber', idNumber);
  if (cvFile) formData.append('cv', cvFile);
  (certificateFiles || []).forEach((file) => formData.append('certificates', file));

  const response = await httpClient.post('/admin/tutor-keys', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.key;
}

// all tutor keys
export async function fetchTutorKeys() {
  const response = await httpClient.get('/admin/tutor-keys');
  return response.data.data.keys;
}

// revoke btn - cancel an unused key
export async function revokeTutorKey(keyId) {
  await httpClient.patch(`/admin/tutor-keys/${keyId}/revoke`);
}

// delete btn - tutor enrollment key
export async function deleteTutorKey(keyId) {
  await httpClient.delete(`/admin/tutor-keys/${keyId}`);
}

// the address of a key's CV or certificate
export function getTutorKeyDocumentUrl(keyId, type) {
  const base = (httpClient.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/admin/tutor-keys/${keyId}/documents/${type}`;
}

// tutor -> their own students and/or admin
export async function fetchMyClassesForMessaging() {
  const response = await httpClient.get('/tutor/my-classes');
  return response.data.data.classes;
}

// send message btn - a tutor messages their students and/or the admin
export async function sendTutorMessage(payload) {
  const response = await httpClient.post('/tutor/messages', payload);
  return response.data;
}

// tutor reminders scheduled for a date and time
export async function fetchMyReminders() {
  const response = await httpClient.get('/tutor/reminders');
  return response.data.data.reminders;
}

// schedule btn - set a reminder for a date and time
export async function scheduleReminder(payload) {
  const response = await httpClient.post('/tutor/reminders', payload);
  return response.data;
}

// cancel btn - remove a reminder that is not sent yet
export async function cancelReminder(reminderId) {
  await httpClient.delete(`/tutor/reminders/${reminderId}`);
}

// notification bell - announcements
export async function fetchMyAnnouncements() {
  const response = await httpClient.get('/announcements', { background: true });
  return response.data.data.announcements;
}

// notification bell - personal reminders
export async function fetchMyNotifications() {
  const response = await httpClient.get('/notifications/mine', { background: true });
  return response.data.data.notifications;
}

// click a notification - it is read now
export async function markMyNotificationRead(notificationId) {
  await httpClient.post(`/notifications/${notificationId}/read`, undefined, { background: true });
}

// click an announcement - this version of it is read
export async function markMyAnnouncementRead(announcementId, version) {
  await httpClient.post(`/announcements/${announcementId}/read`, { version }, { background: true });
}

// mark all as read btn - the whole bell
export async function markAllMyNotificationsRead() {
  await httpClient.post('/notifications/read-all');
}

// delete read btn - every read item in the bell
export async function clearMyReadNotifications() {
  await httpClient.post('/notifications/clear-read');
}

// clear btn - hide one of my notifications on every device
export async function dismissMyNotification(notificationId) {
  await httpClient.post(`/notifications/${notificationId}/dismiss`);
}

// clear btn on an announcement - it comes back only if the admin edits it
export async function dismissMyAnnouncement(announcementId, version) {
  await httpClient.post(`/announcements/${announcementId}/dismiss`, { version });
}

// clear all btn - empty my whole bell on every device
export async function clearMyNotifications() {
  await httpClient.post('/notifications/clear-all');
}

// every announcement (admin)
export async function fetchAllAnnouncements() {
  const response = await httpClient.get('/admin/announcements');
  return response.data.data.announcements;
}

// publish btn - post an announcement
export async function createAnnouncement(payload) {
  const response = await httpClient.post('/admin/announcements', payload);
  return response.data.data.announcement;
}

// edit btn - change an announcement
export async function updateAnnouncement(announcementId, payload) {
  const response = await httpClient.patch(`/admin/announcements/${announcementId}`, payload);
  return response.data.data.announcement;
}

// delete btn - archive an announcement
export async function deleteAnnouncement(announcementId) {
  await httpClient.delete(`/admin/announcements/${announcementId}`);
}

// who a reminder would reach
export async function fetchReminderCandidates(type) {
  const response = await httpClient.get('/admin/reminders/candidates', { params: { type } });
  return response.data.data.candidates;
}

// send reminders btn - fee or attendance reminders
export async function sendReminders({ type, studentIds }) {
  const response = await httpClient.post('/admin/reminders/send', { type, studentIds });
  return response.data.data.result;
}

// --- Student re-registration ---
// students, classes and grades to pick from
export async function fetchReregistrationOptions() {
  const response = await httpClient.get('/admin/reregistration/options');
  return response.data.data.options;
}

// issue re-registration keys (codes are only returned here)
export async function generateReregistrationKeys(payload) {
  const response = await httpClient.post('/admin/reregistration-keys', payload);
  return response.data.data.result;
}

// the issued re-registration keys for a year
export async function fetchReregistrationKeys(academicYear) {
  const response = await httpClient.get('/admin/reregistration-keys', {
    params: academicYear ? { academicYear } : {},
  });
  return response.data.data.keys;
}

// delete btn - re-registration key
export async function deleteReregistrationKey(keyId) {
  await httpClient.delete(`/admin/reregistration-keys/${keyId}`);
}

// revoke btn - cancel an unused re-registration key
export async function revokeReregistrationKey(keyId) {
  await httpClient.patch(`/admin/reregistration-keys/${keyId}/revoke`);
}

// roll-over preview - who moves up, graduates or leaves
export async function fetchRolloverPreview(academicYear) {
  const response = await httpClient.get('/admin/reregistration/rollover', {
    params: { academicYear },
  });
  return response.data.data.preview;
}

// run roll-over btn - move students up and close the accounts of those who did not re-register
export async function runYearlyRollover(academicYear) {
  const response = await httpClient.post('/admin/reregistration/rollover', {
    academicYear,
    confirm: 'RUN',
  });
  return response.data.data.result;
}

// student side
export async function fetchMyReregistrationStatus() {
  const response = await httpClient.get('/reregistration/mine');
  return response.data.data.status;
}

// re-register btn - the student types the key the office gave them
export async function redeemReregistrationKey(keyCode) {
  const response = await httpClient.post('/reregistration/redeem', { keyCode });
  return response.data.data.result;
}

// one-time password reset link for a user - { resetPath, expiresInMinutes }
export async function createPasswordResetLink(userId) {
  const response = await httpClient.post(`/admin/users/${userId}/reset-link`);
  return response.data.data;
}
