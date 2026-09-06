// Placeholder login client (real auth module is N Danushika's)
import httpClient from '../../../../shared/client/src/api/httpClient';

export async function login({ email, password }) {
  const response = await httpClient.post('/session/login', { email, password });
  return response.data.data;
}

export async function logout() {
  await httpClient.post('/session/logout');
}

export async function fetchCurrentSession() {
  const response = await httpClient.get('/session/me');
  return response.data.data;
}
