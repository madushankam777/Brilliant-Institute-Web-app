// feedback form rules - the ticket, a reply and the status filter
const { body, param, query } = require('express-validator');
const { CATEGORIES, RECIPIENT_TYPES, STATUSES } = require('./feedback.constants');

// ticket id in the address must be a number
const ticketIdParamRules = [param('ticketId').isInt({ min: 1 }).withMessage('Invalid ticket id.')];

// new ticket rules - category, who it is for (and which tutor), subject and message
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

// reply rules - the ticket id and a message
const replyRules = [
  ...ticketIdParamRules,
  body('message').trim().isLength({ min: 1, max: 4000 }).withMessage('Reply cannot be empty.'),
];

// inbox filter - an optional status
const listQueryRules = [
  query('status').optional().isIn(Object.values(STATUSES)).withMessage('Invalid status filter.'),
];

// mark all read / delete read / delete all - for the tickets sent to me (inbox) or by me (sent)
const boxRules = [body('box').isIn(['inbox', 'sent']).withMessage('Choose which list to change.')];

module.exports = { ticketIdParamRules, createTicketRules, replyRules, listQueryRules, boxRules };
