import httpClient from '../../../../shared/client/src/api/httpClient';

export async function fetchDashboardStats() {
  const response = await httpClient.get('/admin/dashboard');
  return response.data.data.stats;
}

export async function fetchUsers(filters = {}) {
  const params = {};
  if (filters.search) params.search = filters.search;
  if (filters.role) params.role = filters.role;
  if (filters.status) params.status = filters.status;
  const response = await httpClient.get('/admin/users', { params });
  return response.data.data.users;
}

export async function createUser(payload) {
  const response = await httpClient.post('/admin/users', payload);
  return response.data.data.user;
}

// `confirmName` must be the target's full name, typed in CAPITAL LETTERS -
// the server re-checks this itself, this isn't just a client-side gate.
export async function suspendUser(userId, confirmName) {
  const response = await httpClient.patch(`/admin/users/${userId}/suspend`, { confirmName });
  return response.data.data.user;
}

export async function activateUser(userId) {
  const response = await httpClient.patch(`/admin/users/${userId}/activate`);
  return response.data.data.user;
}

// Tutor's own roster - every Student/Parent enrolled in one of their classes.
export async function fetchMyStudents() {
  const response = await httpClient.get('/students/mine');
  return response.data.data.students;
}

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

export async function fetchTutorKeys() {
  const response = await httpClient.get('/admin/tutor-keys');
  return response.data.data.keys;
}

export async function revokeTutorKey(keyId) {
  await httpClient.patch(`/admin/tutor-keys/${keyId}/revoke`);
}

export function getTutorKeyDocumentUrl(keyId, type) {
  const base = (httpClient.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/admin/tutor-keys/${keyId}/documents/${type}`;
}

export async function fetchMyAnnouncements() {
  const response = await httpClient.get('/announcements');
  return response.data.data.announcements;
}

export async function fetchAllAnnouncements() {
  const response = await httpClient.get('/admin/announcements');
  return response.data.data.announcements;
}

export async function createAnnouncement(payload) {
  const response = await httpClient.post('/admin/announcements', payload);
  return response.data.data.announcement;
}

export async function updateAnnouncement(announcementId, payload) {
  const response = await httpClient.patch(`/admin/announcements/${announcementId}`, payload);
  return response.data.data.announcement;
}

export async function deleteAnnouncement(announcementId) {
  await httpClient.delete(`/admin/announcements/${announcementId}`);
}

export async function sendReminders(type) {
  const response = await httpClient.post('/admin/reminders/send', { type });
  return response.data.data.result;
}
