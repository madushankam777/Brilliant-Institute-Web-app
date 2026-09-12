import httpClient from '../../../../shared/client/src/api/httpClient';

// mark attendance btn
export async function getOrCreateTodaySession(classId) {
  const response = await httpClient.post(`/attendance/classes/${classId}/today-session`);
  return response.data.data.sessionId;
}
