// express-validator rules
const { param, body, query } = require('express-validator');
const { VALID_ATTENDANCE_STATUSES } = require('./attendance.constants');

// class id in the address must be a number
const classIdParamRules = [param('classId').isInt({ min: 1 }).withMessage('Invalid class id.')];

// session id in the address must be a number
const sessionIdParamRules = [
  param('sessionId').isInt({ min: 1 }).withMessage('Invalid session id.'),
];

// save attendance rules - a list of marks, each with a student, a status and optional remarks
const markAttendanceRules = [
  param('sessionId').isInt({ min: 1 }).withMessage('Invalid session id.'),
  body('records').isArray({ min: 1 }).withMessage('At least one attendance entry is required.'),
  body('records.*.studentId').isInt({ min: 1 }).withMessage('Invalid student id.'),
  body('records.*.status')
    .isIn(VALID_ATTENDANCE_STATUSES)
    .withMessage(`Status must be one of: ${VALID_ATTENDANCE_STATUSES.join(', ')}.`),
  body('records.*.remarks')
    .optional({ checkFalsy: true })
    .isLength({ max: 255 })
    .withMessage('Remarks must be 255 characters or fewer.'),
];

// history filter - an optional class id
const historyQueryRules = [
  query('classId').optional().isInt({ min: 1 }).withMessage('Invalid class id.'),
];

// attendance key - must be exactly 6 digits
const selfCheckInRules = [
  body('code').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit attendance key.'),
];

module.exports = {
  classIdParamRules,
  sessionIdParamRules,
  markAttendanceRules,
  historyQueryRules,
  selfCheckInRules,
};
