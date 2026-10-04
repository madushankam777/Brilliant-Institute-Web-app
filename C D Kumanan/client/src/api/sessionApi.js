// login and logout api calls
import httpClient from '../../../../shared/client/src/api/httpClient';

// login btn - sign in and get the user back
export async function login({ email, password }) {
  const response = await httpClient.post('/session/login', { email, password });
  return response.data.data;
}

// logout btn - end the session
export async function logout() {
  await httpClient.post('/session/logout');
}

// ask the server who is logged in
export async function fetchCurrentSession() {
  const response = await httpClient.get('/session/me');
  return response.data.data;
}
