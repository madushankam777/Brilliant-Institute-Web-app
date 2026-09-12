const { body } = require('express-validator');
const { PASSWORD_RULE_MESSAGE, isStrongPassword } = require('../../../../../shared/server/src/utils/passwordPolicy');
const { GRADES } = require('../../../../../shared/server/src/config/grades');

const registerValidationRules = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Full name must be between 2 and 150 characters.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone number looks too long.'),
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
    .withMessage('Full name must be between 2 and 150 characters.'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone number looks too long.'),
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
