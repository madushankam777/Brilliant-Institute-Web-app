// auth API calls - login, register, profile

import httpClient from '../../../shared/client/src/api/httpClient';

/** CREATE - register a new account (Student/Parent, or Tutor via enrollment key). */
export async function registerAccount({
  fullName,
  email,
  phone,
  password,
  acceptedTerms,
  role,
  enrollmentKey,
  grade,
  emailCode,
}) {
  const response = await httpClient.post('/auth/register', {
    fullName,
    email,
    phone,
    password,
    acceptedTerms: acceptedTerms ? 'true' : 'false',
    role,
    enrollmentKey,
    grade,
    emailCode,
  });
  return response.data.data.user;
}

// sign-up - email a 6-digit code to confirm the address
export async function sendSignupCode({ email, fullName }) {
  const response = await httpClient.post('/auth/register/send-code', { email, fullName });
  return response.data.message;
}

// forgot password - check the emailed code before the new password form shows
export async function verifyResetCode({ email, code }) {
  const response = await httpClient.post('/auth/verify-reset-code', { email, code });
  return response.data.message;
}

/** READ + authenticate - log in and start a session (cookie is set by the server). */
export async function login({ email, password }) {
  const response = await httpClient.post('/auth/login', { email, password });
  return response.data.data.user;
}

// POST /auth/logout - end the session
export async function logout() {
  await httpClient.post('/auth/logout');
}

/** READ - "am I logged in, and as whom?" - used on app start-up. */
export async function fetchCurrentSession() {
  const response = await httpClient.get('/auth/session');
  return response.data.data.user;
}

/** READ - the logged-in user's own profile. */
export async function fetchMyProfile() {
  const response = await httpClient.get('/auth/profile');
  return response.data.data.user;
}

/** UPDATE - edit the logged-in user's own profile (REG-07). */
export async function updateMyProfile({ fullName, phone, bio }) {
  const response = await httpClient.put('/auth/profile', { fullName, phone, bio });
  return response.data.data.user;
}

/** UPDATE - upload/replace the logged-in user's own profile picture. */
export async function uploadMyProfilePicture(file) {
  const formData = new FormData();
  formData.append('profilePicture', file);
  const response = await httpClient.post('/auth/profile/picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.user;
}

/** DELETE - remove the logged-in user's own profile picture. */
export async function removeMyProfilePicture() {
  const response = await httpClient.delete('/auth/profile/picture');
  return response.data.data.user;
}

/** UPDATE - change the logged-in user's own password. */
export async function changeMyPassword({ currentPassword, newPassword }) {
  const response = await httpClient.put('/auth/password', { currentPassword, newPassword });
  return response.data.message;
}

/** CREATE - request a password-reset link (REG-05). */
export async function requestPasswordReset(email) {
  const response = await httpClient.post('/auth/forgot-password', { email });
  return response.data; // { success, message }
}

// reset with the emailed code - also logs the user in
export async function resetPasswordWithCode({ email, code, newPassword }) {
  const response = await httpClient.post('/auth/reset-password', { email, code, newPassword });
  return response.data.data.user;
}

// reset with an admin reset link
export async function resetPassword({ token, newPassword }) {
  const response = await httpClient.post('/auth/reset-password', { token, newPassword });
  return response.data.message;
}
