// admin api calls - users, keys, dashboard and announcements
import httpClient from '../../../../shared/client/src/api/httpClient';

// admin dashboard - counts, revenue trend and recent activity
export async function fetchDashboardStats() {
  const response = await httpClient.get('/admin/dashboard');
  return response.data.data.stats;
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

// the students in my classes
export async function fetchMyStudents() {
  const response = await httpClient.get('/students/mine');
  return response.data.data.students;
}

// generate key btn - make a tutor key and upload the tutor's CV and certificates
export async function generateTutorKey({ intendedFor, idNumber, cvFile, certificateFiles }) {
  const formData = new FormData();
  if (intendedFor) formData.append('intendedFor', intendedFor);
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

// notification bell - announcements
export async function fetchMyAnnouncements() {
  const response = await httpClient.get('/announcements');
  return response.data.data.announcements;
}

// notification bell - personal reminders
export async function fetchMyNotifications() {
  const response = await httpClient.get('/notifications/mine');
  return response.data.data.notifications;
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
