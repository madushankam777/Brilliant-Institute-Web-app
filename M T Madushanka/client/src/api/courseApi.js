import httpClient from '../../../../shared/client/src/api/httpClient';

// tutor picker list
export async function fetchAllTutors() {
  const response = await httpClient.get('/payments/admin/tutors');
  return response.data.data.tutors;
}

// class picker list
export async function fetchMyTaughtClasses() {
  const response = await httpClient.get('/attendance/my-classes');
  return response.data.data.classes;
}
