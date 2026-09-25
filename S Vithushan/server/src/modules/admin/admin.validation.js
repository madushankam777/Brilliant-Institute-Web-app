const { body, param, query } = require('express-validator');
const { PASSWORD_RULE_MESSAGE, isStrongPassword } = require('../../../../../shared/server/src/utils/passwordPolicy');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const { TARGET_AUDIENCES, ANNOUNCEMENT_PRIORITIES, REMINDER_TYPES } = require('./admin.constants');

const userIdParamRules = [param('userId').isInt({ min: 1 }).withMessage('Invalid user id.')];

const keyIdParamRules = [param('keyId').isInt({ min: 1 }).withMessage('Invalid key id.')];

const generateTutorKeyRules = [
  body('intendedFor')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 190 })
    .withMessage('That name/email is too long.'),
  body('idNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('ID number is too long.'),
];

const keyDocumentParamRules = [
  param('keyId').isInt({ min: 1 }).withMessage('Invalid key id.'),
  param('type')
    .matches(/^(cv|certificate-\d+)$/)
    .withMessage('Invalid document type.'),
];

const suspendUserRules = [
  param('userId').isInt({ min: 1 }).withMessage('Invalid user id.'),
  body('confirmName').trim().notEmpty().withMessage('Please type the name in capital letters to confirm.'),
];

const createUserRules = [
  body('fullName').trim().isLength({ min: 2, max: 150 }).withMessage('Full name must be 2-150 characters.'),
  body('email').trim().isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password').custom((value) => isStrongPassword(value)).withMessage(PASSWORD_RULE_MESSAGE),
  body('role').isIn(['TUTOR', 'ADMIN']).withMessage('Admin can only directly create Tutor or Admin accounts.'),
];

const listUsersQueryRules = [
  query('search').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  query('role').optional({ checkFalsy: true }).isIn(['STUDENT_PARENT', 'TUTOR', 'ADMIN']),
  query('status').optional({ checkFalsy: true }).isIn(['ACTIVE', 'SUSPENDED', 'DELETED']),
];

const announcementIdParamRules = [
  param('announcementId').isInt({ min: 1 }).withMessage('Invalid announcement id.'),
];

const createAnnouncementRules = [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters.'),
  body('body').trim().isLength({ min: 3, max: 4000 }).withMessage('Message body is required.'),
  body('priority').optional().isIn(ANNOUNCEMENT_PRIORITIES).withMessage('Invalid priority.'),
  body('targetAudience').isIn(TARGET_AUDIENCES).withMessage('Please choose a valid audience.'),
  body('targetGrade')
    .optional({ checkFalsy: true })
    .isIn(GRADES)
    .withMessage('Please choose a valid grade.'),
];

const updateAnnouncementRules = [...announcementIdParamRules, ...createAnnouncementRules];

const sendRemindersRules = [
  body('type').isIn(REMINDER_TYPES).withMessage('Invalid reminder type.'),
  body('studentIds')
    .optional()
    .isArray()
    .withMessage('studentIds must be a list of student ids.'),
  body('studentIds.*').optional().isInt({ min: 1 }).withMessage('Invalid student id.'),
];

const reminderCandidatesQueryRules = [
  query('type').isIn(REMINDER_TYPES).withMessage('Invalid reminder type.'),
];

const tutorMessageRules = [
  body('audience').isIn(['STUDENTS', 'ADMIN', 'BOTH']).withMessage('Please choose who this goes to.'),
  body('classId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid class id.'),
  body('subject').trim().isLength({ min: 3, max: 120 }).withMessage('Subject must be 3-120 characters.'),
  body('message').trim().isLength({ min: 3, max: 350 }).withMessage('Please write your message (3-350 characters).'),
];

const reregistrationKeyIdParamRules = [
  param('keyId').isInt({ min: 1 }).withMessage('Invalid key id.'),
];

// Keys for chosen students, one whole class, or one whole grade.
const generateReregistrationKeysRules = [
  body('mode').isIn(['STUDENTS', 'CLASS', 'GRADE']).withMessage('Choose who the keys are for.'),
  body('studentIds')
    .if(body('mode').equals('STUDENTS'))
    .isArray({ min: 1, max: 500 })
    .withMessage('Choose at least one student.'),
  body('studentIds.*').optional().isInt({ min: 1 }).withMessage('Invalid student id.'),
  body('classId').if(body('mode').equals('CLASS')).isInt({ min: 1 }).withMessage('Choose a class.'),
  body('grade').if(body('mode').equals('GRADE')).isIn(GRADES).withMessage('Choose a grade.'),
  body('toGrade')
    .optional({ checkFalsy: true })
    .isIn(GRADES)
    .withMessage('Please choose a valid grade.'),
  body('academicYear')
    .optional({ checkFalsy: true })
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Please choose a valid year.'),
];

const revenueQueryRules = [
  query('period')
    .optional({ checkFalsy: true })
    .isIn(['daily', 'monthly', 'yearly', 'fiveYears'])
    .withMessage('Choose daily, monthly, yearly or last 5 years.'),
];

const scheduleReminderRules = [
  body('audience').isIn(['SELF', 'CLASS', 'ALL']).withMessage('Choose who gets this reminder.'),
  body('classId').if(body('audience').equals('CLASS')).isInt({ min: 1 }).withMessage('Choose a class.'),
  body('title').trim().isLength({ min: 3, max: 80 }).withMessage('Give the reminder a title (3-80 characters).'),
  body('message')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage('Keep the message under 300 characters.'),
  body('remindAt')
    .matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .withMessage('Pick a date and a time.'),
];

const reminderIdParamRules = [param('reminderId').isInt({ min: 1 }).withMessage('Invalid reminder id.')];

const reregistrationKeyQueryRules = [
  query('academicYear')
    .optional({ checkFalsy: true })
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Please choose a valid year.'),
];

const redeemReregistrationKeyRules = [
  body('keyCode')
    .trim()
    .notEmpty()
    .withMessage('Enter the key the office gave you.')
    .bail()
    .isLength({ min: 8, max: 24 })
    .withMessage('That key does not look right - check it and try again.')
    .bail()
    .matches(/^[A-Za-z0-9-]+$/)
    .withMessage('A key only contains letters, numbers and dashes.'),
];

const rolloverQueryRules = [
  query('academicYear')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Please choose a valid year.'),
];

const runRolloverRules = [
  body('academicYear')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Please choose a valid year.'),
  body('confirm')
    .equals('RUN')
    .withMessage('Type RUN to confirm - this closes the accounts of students who did not re-register.'),
];

module.exports = {
  tutorMessageRules,
  rolloverQueryRules,
  runRolloverRules,
  generateReregistrationKeysRules,
  revenueQueryRules,
  scheduleReminderRules,
  reminderIdParamRules,
  reregistrationKeyIdParamRules,
  reregistrationKeyQueryRules,
  redeemReregistrationKeyRules,
  userIdParamRules,
  createUserRules,
  keyIdParamRules,
  generateTutorKeyRules,
  keyDocumentParamRules,
  suspendUserRules,
  listUsersQueryRules,
  announcementIdParamRules,
  createAnnouncementRules,
  updateAnnouncementRules,
  sendRemindersRules,
  reminderCandidatesQueryRules,
};
