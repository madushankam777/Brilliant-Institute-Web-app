// checks on report requests
const { param, query } = require('express-validator');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const { REPORT_TYPES } = require('./reports.service');

const MAX_DAYS = 366 * 5;

const reportTypeRules = [param('type').isIn(REPORT_TYPES).withMessage('That report does not exist.')];

const reportQueryRules = [
  query('from')
    .optional({ values: 'falsy' })
    .isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage('Choose a valid start date.'),
  query('to')
    .optional({ values: 'falsy' })
    .isDate({ format: 'YYYY-MM-DD', strictMode: true })
    .withMessage('Choose a valid end date.')
    .bail()
    .custom((to, { req }) => {
      const from = req.query.from;
      if (!from) return true;
      if (to < from) throw new Error('The end date must be on or after the start date.');
      const days = (new Date(to) - new Date(from)) / 86400000;
      if (days > MAX_DAYS) throw new Error('Choose a period of 5 years or less.');
      return true;
    }),
  query('studentId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid student.'),
  query('tutorId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid tutor.'),
  query('classId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid class.'),
  query('userId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Choose a valid person.'),
  query('detail').optional({ values: 'falsy' }).isIn(['summary', 'full']).withMessage('Choose what the report should include.'),
  query('grade').optional({ values: 'falsy' }).isIn(GRADES).withMessage('Choose a valid grade.'),
  query('role').optional({ values: 'falsy' }).isIn(['STUDENT_PARENT', 'TUTOR', 'ADMIN']).withMessage('Choose a valid role.'),
  query('status').optional({ values: 'falsy' }).isIn(['ACTIVE', 'SUSPENDED', 'LEFT', 'DELETED']).withMessage('Choose a valid status.'),
  query('academicYear').optional({ values: 'falsy' }).isInt({ min: 2020, max: 2100 }).withMessage('Choose a valid year.'),
];

module.exports = { reportTypeRules, reportQueryRules };
