const { body, param, query } = require('express-validator');
const { CATEGORIES, RECIPIENT_TYPES, STATUSES } = require('./feedback.constants');

const ticketIdParamRules = [param('ticketId').isInt({ min: 1 }).withMessage('Invalid ticket id.')];

const createTicketRules = [
  body('category').isIn(CATEGORIES).withMessage('Please choose a valid category.'),
  body('recipientType').isIn(RECIPIENT_TYPES).withMessage('Please choose who this message is for.'),
  body('recipientTutorId')
    .if((value, { req }) => req.body.recipientType !== 'ADMIN')
    .isInt({ min: 1 })
    .withMessage('Please select a Tutor.'),
  body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Subject must be 3-200 characters.'),
  body('message').trim().isLength({ min: 10, max: 4000 }).withMessage('Please describe the issue in at least 10 characters.'),
];

const replyRules = [
  ...ticketIdParamRules,
  body('message').trim().isLength({ min: 1, max: 4000 }).withMessage('Reply cannot be empty.'),
];

const listQueryRules = [
  query('status').optional().isIn(Object.values(STATUSES)).withMessage('Invalid status filter.'),
];

module.exports = { ticketIdParamRules, createTicketRules, replyRules, listQueryRules };
