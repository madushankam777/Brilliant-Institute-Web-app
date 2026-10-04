// attendance api calls
import httpClient from '../../../../shared/client/src/api/httpClient';

// POST - find or make today's session, returns its id
export async function getOrCreateTodaySession(classId) {
  const response = await httpClient.post(`/attendance/classes/${classId}/today-session`);
  return response.data.data.sessionId;
}
