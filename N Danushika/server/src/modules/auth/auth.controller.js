// auth controller - reads the request, calls the auth service and sends the JSON reply
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { saveUpload } = require('../../../../../shared/server/src/utils/fileStore');
const authService = require('./auth.service');

// POST /api/auth/register/send-code - email a sign-up code to the new address
const sendSignupCode = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body;
  await authService.sendSignupCode({ email, fullName });
  res.status(200).json({ success: true, message: `We emailed a 6-digit code to ${email}.` });
});

// POST /api/auth/cookie-consent - save the cookie banner choice in MySQL
const saveCookieConsent = asyncHandler(async (req, res) => {
  await authService.saveCookieConsent(req.body.choice, req);
  res.status(201).json({ success: true, message: 'Cookie choice saved.' });
});

// POST /api/auth/verify-reset-code - is the emailed reset code right?
const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  await authService.verifyResetCode({ email, code });
  res.status(200).json({ success: true, message: 'Code accepted. Choose your new password.' });
});

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone, role, enrollmentKey, grade, emailCode } = req.body;
  const user = await authService.registerUser({
    fullName,
    email,
    password,
    phone,
    role,
    enrollmentKey,
    grade,
    emailCode,
  });
  res.status(201).json({
    success: true,
    message: 'Account created successfully. You can now log in.',
    data: { user },
  });
});

// POST /api/auth/login - check credentials and start a session.
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginWithEmailAndPassword({ email, password }, res);
  res.status(200).json({
    success: true,
    message: 'Logged in successfully.',
    data: { user },
  });
});

// POST /api/auth/logout - end the current session.
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req, res);
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/profile - get the logged-in user's own profile.
const getProfile = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

// PUT /api/auth/profile - update the logged-in user's own profile.
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, bio } = req.body;
  const user = await authService.updateProfile(req.user.id, { fullName, phone, bio });
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    data: { user },
  });
});

// POST /api/auth/profile/picture - save the uploaded photo and attach it to the user
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('Please choose an image to upload.');
  }
  const publicPath = await saveUpload(req.file, 'PROFILE_PICTURE', req.user.id);
  const user = await authService.updateProfilePicture(req.user.id, publicPath);
  res.status(200).json({
    success: true,
    message: 'Profile picture updated successfully.',
    data: { user },
  });
});

// delete btn - remove the current photo, going back to the initials avatar
const removeProfilePicture = asyncHandler(async (req, res) => {
  const user = await authService.removeProfilePicture(req.user.id);
  res.status(200).json({
    success: true,
    message: 'Profile picture removed.',
    data: { user },
  });
});

// PUT /api/auth/password - change the logged-in user's own password.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const updatedUser = await authService.changePassword(req.user.id, { currentPassword, newPassword });
  // keep this browser signed in; other sessions end with the old password
  authService.refreshSession(res, updatedUser);
  res.status(200).json({ success: true, message: 'Password changed successfully.' });
});

// GET /api/auth/session - lets the frontend check "am I still logged in?".
const getSession = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

// POST /api/auth/forgot-password - send a password reset link.
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
  // same answer whether or not the email exists, and never the link itself
  res.status(200).json({
    success: true,
    message: 'If an account exists for that email, a 6-digit reset code has been sent to it.',
  });
});

// POST /api/auth/reset-password - set a new password using a reset token.
const resetPassword = asyncHandler(async (req, res) => {
  const { token, email, code, newPassword } = req.body;
  // emailed code - reset and log in
  if (!token) {
    const user = await authService.resetPasswordWithCode({ email, code, newPassword }, res);
    res.status(200).json({ success: true, message: 'Your password has been reset. You are now logged in.', data: { user } });
    return;
  }
  await authService.resetPasswordWithToken(token, newPassword);
  res.status(200).json({
    success: true,
    message: 'Your password has been reset. You can now log in with your new password.',
  });
});

module.exports = {
  saveCookieConsent,
  sendSignupCode,
  verifyResetCode,
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  uploadProfilePicture,
  removeProfilePicture,
  changePassword,
  getSession,
  forgotPassword,
  resetPassword,
};
