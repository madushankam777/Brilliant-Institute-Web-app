import httpClient from '../../../../shared/client/src/api/httpClient';

// tutor picker list
export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}
