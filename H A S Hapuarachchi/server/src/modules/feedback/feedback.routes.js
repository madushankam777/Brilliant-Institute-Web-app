const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./feedback.controller');
const { ticketIdParamRules, createTicketRules, replyRules, listQueryRules } = require('./feedback.validation');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  authorize(ROLES.STUDENT_PARENT, ROLES.TUTOR),
  createTicketRules,
  validateRequest,
  controller.submitFeedback
);

router.get('/my', controller.getMyTickets);

router.get(
  '/all',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  listQueryRules,
  validateRequest,
  controller.getAllTickets
);

router.get(
  '/status-counts',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  controller.getTicketStatusCounts
);

router.get('/:ticketId', ticketIdParamRules, validateRequest, controller.getTicketDetails);

// Open to any authenticated role - the service layer enforces that only
// the ticket's own submitter or the staff it's addressed to can actually
// post (see feedback.service.js's replyToTicket).
router.post('/:ticketId/reply', replyRules, validateRequest, controller.replyToTicket);

router.patch(
  '/:ticketId/resolve',
  authorize(ROLES.TUTOR, ROLES.ADMIN),
  ticketIdParamRules,
  validateRequest,
  controller.resolveTicket
);

module.exports = router;
