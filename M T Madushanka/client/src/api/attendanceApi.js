import httpClient from '../../../../shared/client/src/api/httpClient';

export async function fetchClassSessions(classId) {
  const response = await httpClient.get(`/attendance/classes/${classId}/sessions`);
  return response.data.data;
}

// Finds (or silently creates) today's session for this class - the one
// call the "Mark Attendance" button makes, so a Tutor never has to know
// or type a session/class id.
export async function getOrCreateTodaySession(classId) {
  const response = await httpClient.post(`/attendance/classes/${classId}/today-session`);
  return response.data.data.sessionId;
}

export async function fetchAttendanceSheet(sessionId) {
  const response = await httpClient.get(`/attendance/sessions/${sessionId}`);
  return response.data.data;
}

export async function saveAttendance(sessionId, records) {
  const response = await httpClient.post(`/attendance/sessions/${sessionId}`, { records });
  return response.data.data;
}

export async function fetchMyAttendanceHistory(classId) {
  const response = await httpClient.get('/attendance/me', {
    params: classId ? { classId } : {},
  });
  return response.data.data;
}

export async function fetchStudentAttendanceHistory(studentId, classId) {
  const response = await httpClient.get(`/attendance/students/${studentId}`, {
    params: { classId },
  });
  return response.data.data;
}

// A/L classes only - the QR code a Tutor displays for students to scan.
export async function fetchSessionQrCode(sessionId) {
  const response = await httpClient.get(`/attendance/sessions/${sessionId}/qrcode`);
  return response.data.data;
}

export async function checkInWithQr(sessionId) {
  const response = await httpClient.post(`/attendance/sessions/${sessionId}/checkin`);
  return response.data;
}
