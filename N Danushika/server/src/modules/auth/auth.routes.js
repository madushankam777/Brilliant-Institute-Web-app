// auth routes - register, login, logout, profile, password change and reset (all under /api/auth)
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const { authLimiter, resetRequestLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { profilePictureUpload } = require('../../../../../shared/server/src/middleware/upload');
const controller = require('./auth.controller');
const {
  registerValidationRules,
  loginValidationRules,
  updateProfileValidationRules,
  changePasswordValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
  signupCodeValidationRules,
  verifyResetCodeValidationRules,
  cookieConsentValidationRules,
} = require('./auth.validation');

const router = express.Router();

// Public endpoints (no login required).
// send code btn on sign-up - email a code to confirm the address
router.post(
  '/register/send-code',
  resetRequestLimiter,
  signupCodeValidationRules,
  validateRequest,
  controller.sendSignupCode
);

// verify code btn on forgot password - check the code before the new password form shows
router.post(
  '/verify-reset-code',
  authLimiter,
  verifyResetCodeValidationRules,
  validateRequest,
  controller.verifyResetCode
);

// register btn - make a student or tutor account
router.post(
  '/register',
  authLimiter,
  registerValidationRules,
  validateRequest,
  controller.register
);

// login btn - check email and password, then start the session
router.post(
  '/login',
  authLimiter,
  loginValidationRules,
  validateRequest,
  controller.login
);

// logout btn - end the session
router.post('/logout', controller.logout);

// cookie banner Accept / Decline - the choice is saved in MySQL
router.post('/cookie-consent', cookieConsentValidationRules, validateRequest, controller.saveCookieConsent);

// forgot password btn - email a 6-digit reset code
router.post(
  '/forgot-password',
  resetRequestLimiter,
  forgotPasswordValidationRules,
  validateRequest,
  controller.forgotPassword
);

// reset password - set a new password using the emailed code (or an admin reset link)
router.post(
  '/reset-password',
  authLimiter,
  resetPasswordValidationRules,
  validateRequest,
  controller.resetPassword
);

// Endpoints below this line require the user to be logged in.
// session check - is the user still logged in?
router.get('/session', authenticate, controller.getSession);
// my profile - read my own details
router.get('/profile', authenticate, controller.getProfile);
// profile save btn - update name, phone and bio
router.put(
  '/profile',
  authenticate,
  updateProfileValidationRules,
  validateRequest,
  controller.updateProfile
);
// profile picture upload - JPG, PNG or WEBP up to 3 MB
router.post(
  '/profile/picture',
  authenticate,
  profilePictureUpload,
  controller.uploadProfilePicture
);
// profile picture remove btn
router.delete(
  '/profile/picture',
  authenticate,
  controller.removeProfilePicture
);
// change password btn - needs the current password
router.put(
  '/password',
  authenticate,
  authLimiter,
  changePasswordValidationRules,
  validateRequest,
  controller.changePassword
);

module.exports = router;
