// express-validator rules
const { body, param } = require('express-validator');
const { PAYMENT_METHODS } = require('./payment.constants');

const makePaymentRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be a positive number.'),
  body('paymentMethod')
    .isIn(PAYMENT_METHODS)
    .withMessage(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`),
];

const paymentIdParamRules = [
  param('paymentId').isInt({ min: 1 }).withMessage('Invalid payment id.'),
];

module.exports = { makePaymentRules, paymentIdParamRules };
