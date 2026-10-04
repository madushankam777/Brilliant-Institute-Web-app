// class api calls
import httpClient from '../../../../shared/client/src/api/httpClient';

// all tutors
export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}
