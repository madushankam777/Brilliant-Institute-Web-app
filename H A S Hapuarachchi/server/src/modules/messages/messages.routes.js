// Messages routes - chats between students, tutors and the office (/api/messages)
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { messageLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const controller = require('./messages.controller');
const { conversationIdRules, startRules, sendRules, getRules, contactRules } = require('./messages.validation');

const router = express.Router();

// every chat route needs a logged-in user
router.use(authenticate);

// the number on the Messages menu item
router.get('/unread-count', controller.unreadCount);
// new message btn - who I can message
router.get('/contacts', contactRules, validateRequest, controller.listContacts);
// my chats
router.get('/conversations', controller.listConversations);
// send btn on a new chat
router.post('/conversations', messageLimiter, startRules, validateRequest, controller.startConversation);

// mark all as read btn
router.post('/read-all', controller.markAllRead);
// delete read chats btn
router.post('/clear-read', controller.clearRead);
// delete all chats btn
router.post('/clear-all', controller.clearAll);

// one chat and its messages
router.get('/conversations/:conversationId', getRules, validateRequest, controller.getConversation);
// send btn - a reply
router.post('/conversations/:conversationId/messages', messageLimiter, sendRules, validateRequest, controller.sendMessage);
// the chat is open - read it
router.post('/conversations/:conversationId/read', conversationIdRules, validateRequest, controller.markRead);
// delete chat btn - for me only
router.delete('/conversations/:conversationId', conversationIdRules, validateRequest, controller.deleteConversation);

module.exports = router;
