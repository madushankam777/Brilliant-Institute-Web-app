import httpClient from '../../../shared/client/src/api/httpClient';

// public Contact Us form
export async function sendContactMessage(payload) {
  const response = await httpClient.post('/contact', payload);
  return response.data;
}

// public numbers for the About page
export async function fetchInstituteOverview() {
  const response = await httpClient.get('/courses/overview');
  return response.data.data;
}

// admin inbox - status: NEW | HANDLED | '' (all)
export async function fetchContactMessages(status) {
  const response = await httpClient.get('/contact', { params: status ? { status } : {} });
  return response.data.data;
}

export async function setContactMessageStatus(messageId, status) {
  const response = await httpClient.patch(`/contact/${messageId}/status`, { status });
  return response.data;
}
