const { body } = require('express-validator');
const { param } = require('express-validator');
const { INSTANT_PAYMENT_METHODS } = require('./payment.constants');

// Sri Lankan mobile number - what eZ Cash / mCash are actually tied to
// (07XXXXXXXX, or the same number written as +947XXXXXXXX).
const WALLET_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

// Letters, spaces, apostrophes, and hyphens only - no digits or symbols.
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

// Letters, numbers, spaces, hyphens, and slashes - what a real bank
// account number or transfer reference looks like, nothing else.
const BANK_REFERENCE_REGEX = /^[A-Za-z0-9 \-/]+$/;

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
    .withMessage('Cardholder name is required.')
    .matches(NAME_REGEX)
    .withMessage('Cardholder name can only contain letters, spaces, apostrophes, and hyphens - no numbers or symbols.'),
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

// Online checkout only needs what we sign - the payer picks their card or
// wallet on PayHere's own page, so no instrument details come from here.
const onlineCheckoutRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
];

const bankTransferRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
  body('bankReference')
    .trim()
    .isLength({ min: 4, max: 40 })
    .withMessage('Enter your bank account number or transfer reference.')
    .matches(BANK_REFERENCE_REGEX)
    .withMessage('Reference can only contain letters, numbers, spaces, hyphens, and slashes - no other symbols.'),
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
    .withMessage('Enter your bank account number or transfer reference.')
    .matches(BANK_REFERENCE_REGEX)
    .withMessage('Reference can only contain letters, numbers, spaces, hyphens, and slashes - no other symbols.'),
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

// tutor's own payout bank details - every field optional so a tutor can
// save them one at a time, but whatever is sent must look like real data
const bankDetailsRules = [
  body('bankName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Bank name is too long.'),
  body('accountHolder')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Account holder name is too long.'),
  body('accountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9 -]{4,34}$/)
    .withMessage('Enter a valid account number (digits, spaces, and dashes only).'),
  body('branch').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Branch is too long.'),
];

// Admin-only: the institute's own receiving details shown to students
const paymentSettingsRules = [
  body('bankName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Bank name is too long.'),
  body('bankAccountName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Account name is too long.'),
  body('bankAccountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9 -]{4,34}$/)
    .withMessage('Enter a valid account number (digits, spaces, and dashes only).'),
  body('bankBranch').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Branch is too long.'),
  body('bankSwift').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('SWIFT code is too long.'),
  body('ezCashNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(WALLET_PHONE_REGEX)
    .withMessage('Enter a valid eZ Cash mobile number (e.g. 0771234567).'),
  body('mcashNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(WALLET_PHONE_REGEX)
    .withMessage('Enter a valid mCash mobile number (e.g. 0771234567).'),
];

module.exports = {
  makePaymentRules,
  onlineCheckoutRules,
  bankTransferRules,
  editBankTransferRules,
  paymentIdParamRules,
  payTutorRules,
  bankDetailsRules,
  paymentSettingsRules,
  WALLET_PHONE_REGEX,
};
