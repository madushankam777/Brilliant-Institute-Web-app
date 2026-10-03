// Contact Us API calls - the public form, the About page tutors and the admin inbox
import httpClient from '../../../shared/client/src/api/httpClient';

// public Contact Us form
export async function sendContactMessage(payload) {
  const response = await httpClient.post('/contact', payload);
  return response.data;
}

// About page - tutor cards
export async function fetchPublicTutors() {
  const response = await httpClient.get('/courses/public-tutors');
  return response.data.data.tutors;
}

// admin inbox - status: NEW | HANDLED | '' (all)
export async function fetchContactMessages(status) {
  const response = await httpClient.get('/contact', { params: status ? { status } : {} });
  return response.data.data;
}

// admin - mark a message handled, or open it again
export async function setContactMessageStatus(messageId, status) {
  const response = await httpClient.patch(`/contact/${messageId}/status`, { status });
  return response.data;
}
