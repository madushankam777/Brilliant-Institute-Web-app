// Messages validation - input rules for chats
const { body, param, query } = require('express-validator');

// the chat id in the address
const conversationIdRules = [param('conversationId').isInt({ min: 1 }).withMessage('Invalid chat id.')];

// the message text - 1 to 2000 characters
const messageBodyRule = body('body')
  .isString()
  .withMessage('Please type a message.')
  .bail()
  .trim()
  .isLength({ min: 1, max: 2000 })
  .withMessage('Messages must be 1-2000 characters.');

// new chat - who it is with (OFFICE or a person's id) and the first message
const startRules = [
  body('to')
    .custom((value) => value === 'OFFICE' || (Number.isInteger(Number(value)) && Number(value) > 0))
    .withMessage('Please choose who to message.'),
  messageBodyRule,
];

// a reply
const sendRules = [...conversationIdRules, messageBodyRule];

// opening a chat - optionally only the messages after this id
const getRules = [
  ...conversationIdRules,
  query('after').optional().isInt({ min: 0 }).withMessage('Invalid message id.'),
];

// contact search
const contactRules = [query('search').optional().isString().isLength({ max: 60 }).withMessage('Search is too long.')];

module.exports = { conversationIdRules, startRules, sendRules, getRules, contactRules };
