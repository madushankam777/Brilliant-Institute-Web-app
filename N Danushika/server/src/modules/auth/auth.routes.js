const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const { authLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
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
} = require('./auth.validation');

const router = express.Router();

// Public endpoints (no login required).
router.post(
  '/register',
  authLimiter,
  registerValidationRules,
  validateRequest,
  controller.register
);

router.post(
  '/login',
  authLimiter,
  loginValidationRules,
  validateRequest,
  controller.login
);

router.post('/logout', controller.logout);

router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidationRules,
  validateRequest,
  controller.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  resetPasswordValidationRules,
  validateRequest,
  controller.resetPassword
);

// Endpoints below this line require the user to be logged in.
router.get('/session', authenticate, controller.getSession);
router.get('/profile', authenticate, controller.getProfile);
router.put(
  '/profile',
  authenticate,
  updateProfileValidationRules,
  validateRequest,
  controller.updateProfile
);
router.post(
  '/profile/picture',
  authenticate,
  profilePictureUpload,
  controller.uploadProfilePicture
);
router.delete(
  '/profile/picture',
  authenticate,
  controller.removeProfilePicture
);
router.put(
  '/password',
  authenticate,
  authLimiter,
  changePasswordValidationRules,
  validateRequest,
  controller.changePassword
);

module.exports = router;
