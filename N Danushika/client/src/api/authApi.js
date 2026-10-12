import httpClient from '../../../../shared/client/src/api/httpClient';

// register btn
export async function registerAccount({
  fullName,
  email,
  phone,
  password,
  acceptedTerms,
  role,
  enrollmentKey,
  grade,
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
  });
  return response.data.data.user;
}

// Log in 
export async function login({ email, password }) {
  const response = await httpClient.post('/auth/login', { email, password });
  return response.data.data.user;
}


export async function logout() {
  await httpClient.post('/auth/logout');
}


export async function fetchCurrentSession() {
  const response = await httpClient.get('/auth/session');
  return response.data.data.user;
}


export async function fetchMyProfile() {
  const response = await httpClient.get('/auth/profile');
  return response.data.data.user;
}


export async function updateMyProfile({ fullName, phone, bio }) {
  const response = await httpClient.put('/auth/profile', { fullName, phone, bio });
  return response.data.data.user;
}


export async function uploadMyProfilePicture(file) {
  const formData = new FormData();
  formData.append('profilePicture', file);
  const response = await httpClient.post('/auth/profile/picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.user;
}

// Remove the logged-in user's own profile picture.
export async function removeMyProfilePicture() {
  const response = await httpClient.delete('/auth/profile/picture');
  return response.data.data.user;
}

// Change the logged-in user's own password.
export async function changeMyPassword({ currentPassword, newPassword }) {
  const response = await httpClient.put('/auth/password', { currentPassword, newPassword });
  return response.data.message;
}


export async function requestPasswordReset(email) {
  const response = await httpClient.post('/auth/forgot-password', { email });
  return response.data;
}


export async function resetPassword({ token, newPassword }) {
  const response = await httpClient.post('/auth/reset-password', { token, newPassword });
  return response.data.message;
}
