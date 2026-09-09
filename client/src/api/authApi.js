// All the API calls for login/register/profile live here, so pages just
// call these functions instead of using axios directly.
import httpClient from '../../../shared/client/src/api/httpClient';

// Register a new Student/Parent account.
export async function registerAccount({ fullName, email, phone, password, acceptedTerms }) {
  const response = await httpClient.post('/auth/register', {
    fullName,
    email,
    phone,
    password,
    acceptedTerms: acceptedTerms ? 'true' : 'false',
  });
  return response.data.data.user;
}

// Log in - the server sets the session cookie for us.
export async function login({ email, password }) {
  const response = await httpClient.post('/auth/login', { email, password });
  return response.data.data.user;
}

export async function logout() {
  await httpClient.post('/auth/logout');
}

// Check if the user is already logged in (called when the app starts).
export async function fetchCurrentSession() {
  const response = await httpClient.get('/auth/session');
  return response.data.data.user;
}

// Get the logged-in user's own profile.
export async function fetchMyProfile() {
  const response = await httpClient.get('/auth/profile');
  return response.data.data.user;
}

// Update the logged-in user's own profile.
export async function updateMyProfile({ fullName, phone }) {
  const response = await httpClient.put('/auth/profile', { fullName, phone });
  return response.data.data.user;
}

// Change the logged-in user's own password.
export async function changeMyPassword({ currentPassword, newPassword }) {
  const response = await httpClient.put('/auth/password', { currentPassword, newPassword });
  return response.data.message;
}

// Ask for a password-reset link to be sent by email.
export async function requestPasswordReset(email) {
  const response = await httpClient.post('/auth/forgot-password', { email });
  return response.data;
}

// Finish a password reset using the token from the email.
export async function resetPassword({ token, newPassword }) {
  const response = await httpClient.post('/auth/reset-password', { token, newPassword });
  return response.data.message;
}
