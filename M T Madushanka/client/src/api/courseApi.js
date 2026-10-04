// class and tutor api calls
import httpClient from '../../../../shared/client/src/api/httpClient';

// tutors with masked bank details (admin only)
export async function fetchAllTutors() {
  const response = await httpClient.get('/payments/admin/tutors');
  return response.data.data.tutors;
}

// the classes I teach
export async function fetchMyTaughtClasses() {
  const response = await httpClient.get('/attendance/my-classes');
  return response.data.data.classes;
}
