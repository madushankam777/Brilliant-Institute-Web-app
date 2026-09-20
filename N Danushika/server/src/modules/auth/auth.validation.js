const { body } = require('express-validator');
const { PASSWORD_RULE_MESSAGE, isStrongPassword } = require('../../../../../shared/server/src/utils/passwordPolicy');
const { GRADES } = require('../../../../../shared/server/src/config/grades');

// Letters, spaces, apostrophes, periods, and hyphens only - covers real
// names ("Mary-Jane O'Brien", "J. Fernando") while rejecting digits and
// symbols someone typed (or pasted) by mistake.
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
const NAME_MESSAGE = 'Full name can only contain letters, spaces, apostrophes, periods, and hyphens - no numbers or symbols.';

// Digits plus the punctuation real phone numbers are written with
// (+94 71 234 5678, (071) 234-5678, ...) - no letters or other symbols.
const PHONE_REGEX = /^[0-9+\-\s()]+$/;
const PHONE_MESSAGE = 'Phone number can only contain digits, spaces, and the symbols + - ( ).';

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

const loginValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

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

const changePasswordValidationRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .custom((value) => isStrongPassword(value))
    .withMessage(PASSWORD_RULE_MESSAGE),
];

const forgotPasswordValidationRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
];

const resetPasswordValidationRules = [
  body('token').trim().notEmpty().withMessage('Reset token is required.'),
  body('newPassword')
    .custom((value) => isStrongPassword(value))
    .withMessage(PASSWORD_RULE_MESSAGE),
];

module.exports = {
  registerValidationRules,
  loginValidationRules,
  updateProfileValidationRules,
  changePasswordValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
};
