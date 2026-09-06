// Route table, mounted at /api/payments
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./payment.controller');
const { makePaymentRules, paymentIdParamRules } = require('./payment.validation');

const router = express.Router();

router.use(authenticate, authorize(ROLES.STUDENT_PARENT));

router.get('/balance', controller.getMyBalances);
router.get('/history', controller.getMyPaymentHistory);
router.post('/', makePaymentRules, validateRequest, controller.makePayment);
router.patch(
  '/:paymentId/retry',
  paymentIdParamRules,
  validateRequest,
  controller.retryPendingPayment
);

module.exports = router;
