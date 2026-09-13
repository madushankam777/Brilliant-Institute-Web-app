import httpClient from '../../../shared/client/src/api/httpClient';

export async function fetchClassSessions(classId) {
  const response = await httpClient.get(`/attendance/classes/${classId}/sessions`);
  return response.data.data;
}

// mark attendance btn
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

// generate key btn - tutor/admin makes a fresh attendance key for this session
export async function startSelfCheckIn(sessionId) {
  const response = await httpClient.post(`/attendance/sessions/${sessionId}/checkin/start`);
  return response.data.data;
}

// student enters the key their tutor gave them
export async function selfCheckIn(code) {
  const response = await httpClient.post('/attendance/checkin', { code });
  return response.data;
}
