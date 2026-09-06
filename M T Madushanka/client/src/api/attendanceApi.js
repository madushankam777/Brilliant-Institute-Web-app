// Frontend API client for the attendance endpoints
import httpClient from '../../../../shared/client/src/api/httpClient';

export async function fetchClassSessions(classId) {
  const response = await httpClient.get(`/attendance/classes/${classId}/sessions`);
  return response.data.data;
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
