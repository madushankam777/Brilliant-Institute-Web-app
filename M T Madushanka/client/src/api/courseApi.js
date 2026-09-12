import httpClient from '../../../../shared/client/src/api/httpClient';

// Only the piece of the Course module's API this module's own pages need -
// picking a Tutor to pay out from the Admin payment screen. The rest of
// the Course API (browsing, enrolling, ...) lives in C D Kumanan's copy of
// this file.
export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}
