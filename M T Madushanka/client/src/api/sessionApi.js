import httpClient from '../../../../shared/client/src/api/httpClient';

// register btn - Student/Parent only in this module
export async function register({ fullName, email, phone, password, grade }) {
  const response = await httpClient.post('/session/register', {
    fullName,
    email,
    phone,
    password,
    grade,
  });
  return response.data.data;
}

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
