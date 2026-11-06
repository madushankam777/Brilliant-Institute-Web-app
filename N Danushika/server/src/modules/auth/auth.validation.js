// auth validation - input rules for register, login, profile, password change and reset
const { body } = require('express-validator');
const { PASSWORD_RULE_MESSAGE, isStrongPassword } = require('../../../../../shared/server/src/utils/passwordPolicy');
const { GRADES } = require('../../../../../shared/server/src/config/grades');

// Letters, spaces, apostrophes, periods, and hyphens only
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
const NAME_MESSAGE = 'Full name can only contain letters, spaces, apostrophes, periods, and hyphens - no numbers or symbols.';

// digits and phone punctuation only
const PHONE_REGEX = /^[0-9+\-\s()]+$/;
const PHONE_MESSAGE = 'Phone number can only contain digits, spaces, and the symbols + - ( ).';

// register form rules - name, email, phone, strong password, terms, role, tutor key or grade
const registerValidationRules = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Full name must be between 2 and 150 characters.')
    .matches(NAME_REGEX)
    .withMessage(NAME_MESSAGE),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone number looks too long.')
    .matches(PHONE_REGEX)
    .withMessage(PHONE_MESSAGE),
  body('password')
    .custom((value) => isStrongPassword(value))
    .withMessage(PASSWORD_RULE_MESSAGE),
  body('acceptedTerms')
    .equals('true')
    .withMessage('You must accept the Terms of Service and Privacy Policy to register.'),
  body('role')
    .optional()
    .isIn(['STUDENT_PARENT', 'TUTOR'])
    .withMessage('Invalid role selection.'),
  body('enrollmentKey')
    .if((value, { req }) => req.body.role === 'TUTOR')
    .trim()
    .notEmpty()
    .withMessage('An enrollment key from an Administrator is required to register as a Tutor.'),
  body('grade')
    .if((value, { req }) => req.body.role !== 'TUTOR')
    .isIn(GRADES)
    .withMessage('Please select your grade.'),
];

// login form rules - email and password
const loginValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

// profile form rules - name, phone and bio
const updateProfileValidationRules = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Full name must be between 2 and 150 characters.')
    .matches(NAME_REGEX)
    .withMessage(NAME_MESSAGE),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone number looks too long.')
    .matches(PHONE_REGEX)
    .withMessage(PHONE_MESSAGE),
  body('bio')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Bio must be 1000 characters or fewer.'),
];

// change password rules - current password and a strong new one
const changePasswordValidationRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .custom((value) => isStrongPassword(value))
    .withMessage(PASSWORD_RULE_MESSAGE),
];

// forgot password rules - a valid email
const forgotPasswordValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
];

// reset password rules - email and 6-digit code (or a reset link token) and a strong new password
const resetPasswordValidationRules = [
  // either the admin's reset link token, or the email + 6-digit code
  body('token').optional({ checkFalsy: true }).trim().isLength({ min: 32, max: 128 }).withMessage('This reset link is not valid.'),
  body('email')
    .if((value, { req }) => !req.body.token)
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('code')
    .if((value, { req }) => !req.body.token)
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Enter the 6-digit code from the email.'),
  body('newPassword')
    .custom((value) => isStrongPassword(value))
    .withMessage(PASSWORD_RULE_MESSAGE),
];

// sign-up code rules - a valid email (the name is optional, for the greeting)
const signupCodeValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('fullName').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).matches(NAME_REGEX).withMessage(NAME_MESSAGE),
];

// verify reset code rules - email and the 6-digit code
const verifyResetCodeValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('code').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code from the email.'),
];

// cookie banner choice rules
const cookieConsentValidationRules = [
  body('choice').isIn(['accepted', 'declined']).withMessage('Choose accept or decline.'),
];

module.exports = {
  cookieConsentValidationRules,
  signupCodeValidationRules,
  verifyResetCodeValidationRules,
  registerValidationRules,
  loginValidationRules,
  updateProfileValidationRules,
  changePasswordValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
};
