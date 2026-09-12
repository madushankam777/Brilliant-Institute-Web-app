import httpClient from '../../../../shared/client/src/api/httpClient';

// Only the pieces of the Course module's API this module's own pages need -
// picking a Tutor to pay out from the Admin payment screen, and listing
// "my classes" so a Tutor/Admin can pick one by name instead of typing a
// raw class id. The rest of the Course API (browsing, enrolling, ...)
// lives in C D Kumanan's copy of this file.
export async function fetchAllTutors() {
  const response = await httpClient.get('/courses/tutors');
  return response.data.data.tutors;
}

export async function fetchMyTaughtClasses() {
  const response = await httpClient.get('/courses/my-classes');
  return response.data.data.classes;
}
