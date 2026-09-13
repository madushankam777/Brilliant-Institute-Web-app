const { body } = require('express-validator');
const { param } = require('express-validator');
const { INSTANT_PAYMENT_METHODS } = require('./payment.constants');

// Sri Lankan mobile number - what eZ Cash / mCash are actually tied to
// (07XXXXXXXX, or the same number written as +947XXXXXXXX).
const WALLET_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

function isMethod(...methods) {
  return (value, { req }) => methods.includes(req.body.paymentMethod);
}

const makePaymentRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be a positive number.'),
  body('paymentMethod')
    .isIn(INSTANT_PAYMENT_METHODS)
    .withMessage(
      `Payment method must be one of: ${INSTANT_PAYMENT_METHODS.join(', ')}. ` +
        'Bank transfers are submitted from a separate form.'
    ),

  body('paymentDetails').isObject().withMessage('Payment details are required.'),

  body('paymentDetails.cardholderName')
    .if(isMethod('CARD'))
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Cardholder name is required.'),
  body('paymentDetails.cardLast4')
    .if(isMethod('CARD'))
    .matches(/^\d{4}$/)
    .withMessage('Card number is invalid.'),
  body('paymentDetails.cardBrand')
    .if(isMethod('CARD'))
    .trim()
    .notEmpty()
    .withMessage('Card number is invalid.'),

  body('paymentDetails.walletPhone')
    .if(isMethod('EZ_CASH', 'MCASH'))
    .matches(WALLET_PHONE_REGEX)
    .withMessage('Enter a valid mobile number registered for this wallet (e.g. 07XXXXXXXX).'),
];

const bankTransferRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('bankReference')
    .trim()
    .isLength({ min: 4, max: 40 })
    .withMessage('Enter your bank account number or transfer reference.'),
];

const paymentIdParamRules = [
  param('paymentId').isInt({ min: 1 }).withMessage('Invalid payment id.'),
];

// edit btn - bankReference is optional here since a student may only replace the receipt image
const editBankTransferRules = [
  ...paymentIdParamRules,
  body('bankReference')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 4, max: 40 })
    .withMessage('Enter your bank account number or transfer reference.'),
];

const payTutorRules = [
  body('tutorId').isInt({ min: 1 }).withMessage('Please select a Tutor.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('note').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Note is too long.'),
  body('periodLabel')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 40 })
    .withMessage('Period label is too long.'),
];

module.exports = {
  makePaymentRules,
  bankTransferRules,
  editBankTransferRules,
  paymentIdParamRules,
  payTutorRules,
  WALLET_PHONE_REGEX,
};
