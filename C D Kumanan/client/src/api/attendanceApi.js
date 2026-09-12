import httpClient from '../../../../shared/client/src/api/httpClient';

// Only the piece of the Attendance module's API this module's own pages
// need - the "Mark Attendance" button on My Classes jumping straight to
// today's session. The rest of the Attendance API lives in
// M T Madushanka's copy of this file.
export async function getOrCreateTodaySession(classId) {
  const response = await httpClient.post(`/attendance/classes/${classId}/today-session`);
  return response.data.data.sessionId;
}
