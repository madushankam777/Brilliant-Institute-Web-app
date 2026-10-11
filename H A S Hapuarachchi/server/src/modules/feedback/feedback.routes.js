// feedback routes - submit tickets, read them, reply and resolve (/api/feedback)
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./feedback.controller');
const { ticketIdParamRules, createTicketRules, replyRules, listQueryRules, boxRules } = require('./feedback.validation');

const router = express.Router();

// every feedback route needs a logged-in user
router.use(authenticate);

// submit btn - a student or tutor sends a new feedback or complaint ticket
router.post(
  '/',
  authorize(ROLES.STUDENT_PARENT, ROLES.TUTOR),
  createTicketRules,
  validateRequest,
  controller.submitFeedback
);

// my tickets - the ones I submitted
router.get('/my', controller.getMyTickets);

// staff inbox - tickets addressed to me (admin or tutor), optionally by status
router.get(
  '/all',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  listQueryRules,
  validateRequest,
  controller.getAllTickets
);

// staff - how many tickets are PENDING, IN_PROGRESS and RESOLVED
router.get(
  '/status-counts',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  controller.getTicketStatusCounts
);

// the number on the Feedback menu item
router.get('/unread-count', controller.unreadCount);
// mark all as read btn - inbox (sent to me) or sent (by me)
router.post('/read-all', boxRules, validateRequest, controller.markAllRead);
// delete read btn
router.post('/clear-read', boxRules, validateRequest, controller.clearRead);
// delete all btn
router.post('/clear-all', boxRules, validateRequest, controller.clearAll);

// one ticket with its replies
router.get('/:ticketId', ticketIdParamRules, validateRequest, controller.getTicketDetails);
// opened - I have read it
router.post('/:ticketId/read', ticketIdParamRules, validateRequest, controller.markTicketRead);
// delete btn - off my list only (the ticket stays for the other person and the reports)
router.delete('/:ticketId', ticketIdParamRules, validateRequest, controller.hideTicket);

// send reply btn - service layer checks sender is allowed
router.post('/:ticketId/reply', replyRules, validateRequest, controller.replyToTicket);

// resolve btn - staff close a ticket
router.patch(
  '/:ticketId/resolve',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  ticketIdParamRules,
  validateRequest,
  controller.resolveTicket
);

module.exports = router;
