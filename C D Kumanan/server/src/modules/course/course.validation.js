// express-validator rules for every course/class endpoint.
const { body, param, query } = require('express-validator');
const { SUBJECT_AREAS, DAYS_OF_WEEK } = require('./course.constants');
const { GRADES } = require('../../../../../shared/server/src/config/grades');

// a time as HH:MM (or HH:MM:SS)
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// class id in the address must be a number
const classIdParamRules = [param('classId').isInt({ min: 1 }).withMessage('Invalid class id.')];

// enrolment id in the address must be a number
const enrollmentIdParamRules = [
  param('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
];

// delete btn - must type DELETE to confirm
const deleteEnrollmentRecordRules = [
  ...enrollmentIdParamRules,
  body('confirmText').equals('DELETE').withMessage('Please type DELETE in capital letters to confirm.'),
];

// tutor id in the address must be a number
const tutorIdParamRules = [param('tutorId').isInt({ min: 1 }).withMessage('Invalid tutor id.')];

// user id in the address must be a number
const timetableUserIdRules = [param('userId').isInt({ min: 1 }).withMessage('Invalid user id.')];

// a date written as YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// a date range of at most about a year
const holidayQueryRules = [
  query('from').matches(DATE_REGEX).withMessage('Give a start date (YYYY-MM-DD).'),
  query('to')
    .matches(DATE_REGEX)
    .withMessage('Give an end date (YYYY-MM-DD).')
    .bail()
    .custom((to, { req }) => {
      const days = (new Date(to) - new Date(req.query.from)) / (24 * 60 * 60 * 1000);
      return days >= 0 && days <= 400;
    })
    .withMessage('The end date must be after the start date and within about a year of it.'),
];

// class search filters - all optional
const browseQueryRules = [
  query('search').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  query('subjectArea').optional({ checkFalsy: true }).isIn(SUBJECT_AREAS),
  query('level').optional({ checkFalsy: true }).isIn(GRADES),
  query('dayOfWeek').optional({ checkFalsy: true }).isIn(DAYS_OF_WEEK),
];

// class form rules - title, subject area, level, venue, day, times, capacity and fee
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
  body('fee')
    .customSanitizer((value) => (value === undefined || value === null ? value : String(value).trim()))
    .matches(/^\d{1,7}(\.\d{1,2})?$/)
    .withMessage('Fee must be a number between 0 and 1,000,000.')
    .bail()
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('Fee must be between 0 and 1,000,000.'),
  body('tutorId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid tutor id.'),
];

// create class rules - the class form plus an optional first class date
const createClassRules = [
  ...classBodyRules,
  body('startDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Pick the first class date on the calendar.')
    .bail()
    .isISO8601({ strict: true })
    .withMessage('Pick the first class date on the calendar.'),
];
// edit class rules - the class id plus the class form
const updateClassRules = [...classIdParamRules, ...classBodyRules];

// the date of a cancelled day or an extra class
const eventDateRule = body('date')
  .matches(DATE_REGEX)
  .withMessage('Pick a date on the calendar.')
  .bail()
  .isISO8601({ strict: true })
  .withMessage('Pick a date on the calendar.');
// an optional note (up to 255 characters)
const eventNoteRule = body('note').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
  .withMessage('Keep the note under 255 characters.');

// cancel day rules - class id, date and an optional note
const cancelDayRules = [...classIdParamRules, eventDateRule, eventNoteRule];

// extra class rules - class id, date, start and end time, optional venue and note
const extraClassRules = [
  ...classIdParamRules,
  eventDateRule,
  body('startTime').matches(TIME_REGEX).withMessage('Start time must be in HH:MM format.'),
  body('endTime')
    .matches(TIME_REGEX)
    .withMessage('End time must be in HH:MM format.')
    .custom((value, { req }) => !req.body.startTime || value > req.body.startTime)
    .withMessage('End time must be after the start time.'),
  body('venue').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  eventNoteRule,
];

// event id in the address must be a number
const eventIdParamRules = [param('eventId').isInt({ min: 1 }).withMessage('Invalid id.')];

module.exports = {
  cancelDayRules,
  extraClassRules,
  eventIdParamRules,
  classIdParamRules,
  enrollmentIdParamRules,
  deleteEnrollmentRecordRules,
  tutorIdParamRules,
  timetableUserIdRules,
  holidayQueryRules,
  browseQueryRules,
  createClassRules,
  updateClassRules,
};
