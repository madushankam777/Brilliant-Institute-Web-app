// admin api calls - tutors and users
import httpClient from '../../../../shared/client/src/api/httpClient';

// `confirmName` must be the target's full name, typed in CAPITAL LETTERS
export async function suspendUser(userId, confirmName) {
  const response = await httpClient.patch(`/admin/users/${userId}/suspend`, { confirmName });
  return response.data.data.user;
}

// activate btn - reopen a suspended account
export async function activateUser(userId) {
  const response = await httpClient.patch(`/admin/users/${userId}/activate`);
  return response.data.data.user;
}

// Tutor's own roster - every Student/Parent enrolled in one of their classes.
export async function fetchMyStudents() {
  const response = await httpClient.get('/students/mine');
  return response.data.data.students;
}
