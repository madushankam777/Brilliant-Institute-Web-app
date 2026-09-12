// express-validator rules for every course/class endpoint.
const { body, param, query } = require('express-validator');
const { SUBJECT_AREAS, DAYS_OF_WEEK } = require('./course.constants');
const { GRADES } = require('../../../../../shared/server/src/config/grades');

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const classIdParamRules = [param('classId').isInt({ min: 1 }).withMessage('Invalid class id.')];

const enrollmentIdParamRules = [
  param('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
];

// delete btn - must type DELETE to confirm
const deleteEnrollmentRecordRules = [
  ...enrollmentIdParamRules,
  body('confirmText').equals('DELETE').withMessage('Please type DELETE in capital letters to confirm.'),
];

const tutorIdParamRules = [param('tutorId').isInt({ min: 1 }).withMessage('Invalid tutor id.')];

const browseQueryRules = [
  query('search').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  query('subjectArea').optional({ checkFalsy: true }).isIn(SUBJECT_AREAS),
  query('level').optional({ checkFalsy: true }).isIn(GRADES),
  query('dayOfWeek').optional({ checkFalsy: true }).isIn(DAYS_OF_WEEK),
];

const classBodyRules = [
  body('subject').trim().isLength({ min: 3, max: 150 }).withMessage('Class title must be 3-150 characters.'),
  body('subjectArea').isIn(SUBJECT_AREAS).withMessage('Please choose a valid subject area.'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  body('level').isIn(GRADES).withMessage('Please choose a valid grade/level.'),
  body('venue').trim().isLength({ min: 1, max: 150 }).withMessage('Venue is required.'),
  body('dayOfWeek').isIn(DAYS_OF_WEEK).withMessage('Please choose a valid day of the week.'),
  body('startTime').matches(TIME_REGEX).withMessage('Start time must be in HH:MM format.'),
  body('endTime')
    .matches(TIME_REGEX)
    .withMessage('End time must be in HH:MM format.')
    .custom((value, { req }) => !req.body.startTime || value > req.body.startTime)
    .withMessage('End time must be after the start time.'),
  body('capacity').isInt({ min: 1, max: 500 }).withMessage('Capacity must be between 1 and 500.'),
  body('fee').isFloat({ min: 0 }).withMessage('Fee must be zero or a positive number.'),
  body('tutorId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid tutor id.'),
];

const createClassRules = [...classBodyRules];
const updateClassRules = [...classIdParamRules, ...classBodyRules];

module.exports = {
  classIdParamRules,
  enrollmentIdParamRules,
  deleteEnrollmentRecordRules,
  tutorIdParamRules,
  browseQueryRules,
  createClassRules,
  updateClassRules,
};
