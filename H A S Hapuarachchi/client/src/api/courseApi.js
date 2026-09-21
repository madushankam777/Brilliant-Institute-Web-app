import httpClient from '../../../../shared/client/src/api/httpClient';

export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}
