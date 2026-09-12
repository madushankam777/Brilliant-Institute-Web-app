const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { toPublicUploadPath } = require('../../../../../shared/server/src/middleware/upload');
const authService = require('./auth.service');

// POST /api/auth/register - create a Student/Parent account, or a Tutor
// account if a valid enrollment key is included.
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone, role, enrollmentKey, grade } = req.body;
  const user = await authService.registerUser({
    fullName,
    email,
    password,
    phone,
    role,
    enrollmentKey,
    grade,
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
  authService.logout(res);
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

const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('Please choose an image to upload.');
  }
  const publicPath = toPublicUploadPath(req.file.path);
  const user = await authService.updateProfilePicture(req.user.id, publicPath);
  res.status(200).json({
    success: true,
    message: 'Profile picture updated successfully.',
    data: { user },
  });
});

// PUT /api/auth/password - change the logged-in user's own password.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, { currentPassword, newPassword });
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
  const result = await authService.requestPasswordReset(email);
  res.status(200).json({
    success: true,
    message:
      'If an account exists for that email, a password reset link has been sent.',
    // devOnlyResetToken only exists outside production - see auth.service.js.
    data: result,
  });
});

// POST /api/auth/reset-password - set a new password using a reset token.
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPasswordWithToken(token, newPassword);
  res.status(200).json({
    success: true,
    message: 'Your password has been reset. You can now log in with your new password.',
  });
});

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  uploadProfilePicture,
  changePassword,
  getSession,
  forgotPassword,
  resetPassword,
};
