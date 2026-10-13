// payment form rules
const { body } = require('express-validator');
const { param, query } = require('express-validator');
const { INSTANT_PAYMENT_METHODS } = require('./payment.constants');

function amountRule(field, message) {
  return body(field)
    .customSanitizer((value) => (value === undefined || value === null ? value : String(value).trim()))
    .matches(/^\d{1,8}(\.\d{1,2})?$/)
    .withMessage(message)
    .bail()
    .isFloat({ gt: 0, max: 10000000 })
    .withMessage(message);
}

const WALLET_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

const BANK_REFERENCE_REGEX = /^[A-Za-z0-9 \-/]+$/;

function isMethod(...methods) {
  return (value, { req }) => methods.includes(req.body.paymentMethod);
}

// pay form rules
const makePaymentRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  amountRule('amount', 'Amount must be a positive number.'),
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

const onlineCheckoutRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  amountRule('amount', 'Amount must be a positive number.'),
];

// bank slip form rules
const bankTransferRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Invalid enrollment id.'),
  amountRule('amount', 'Amount must be a positive number.'),
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

// approve - optional received amount
const approveBankTransferRules = [
  ...paymentIdParamRules,
  body('amount')
    .optional({ checkFalsy: true })
    .customSanitizer((value) => String(value).trim())
    .matches(/^\d{1,8}(\.\d{1,2})?$/)
    .withMessage('Enter the amount shown on the bank slip.')
    .bail()
    .isFloat({ gt: 0, max: 10000000 })
    .withMessage('Enter the amount shown on the bank slip.'),
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

// pay tutor form rules
const payTutorRules = [
  body('tutorId').isInt({ min: 1 }).withMessage('Please select a Tutor.'),
  amountRule('amount', 'Amount must be a positive number.'),
  body('note').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Note is too long.'),
  body('periodLabel')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 40 })
    .withMessage('Period label is too long.'),
  body('method')
    .optional({ checkFalsy: true })
    .isIn(['BANK_TRANSFER', 'CARD_ACCOUNT', 'EZ_CASH', 'MCASH', 'BANK_FILE', 'PAYOUT_API'])
    .withMessage('Choose how this payout is made.'),
  body('bankReference')
    .if(body('method').isIn(['BANK_TRANSFER', 'CARD_ACCOUNT', 'EZ_CASH', 'MCASH']))
    .trim()
    .isLength({ min: 3, max: 60 })
    .withMessage('Enter the reference or transaction ID for this transfer.')
    .bail()
    .matches(BANK_REFERENCE_REGEX)
    .withMessage('Reference can only contain letters, numbers, spaces, hyphens, and slashes.'),
  body('walletNumber')
    .if(body('method').isIn(['EZ_CASH', 'MCASH']))
    .trim()
    .matches(WALLET_PHONE_REGEX)
    .withMessage('Enter the tutor\'s mobile wallet number, e.g. 0771234567.'),
  body('transferDate')
    .optional({ checkFalsy: true })
    .matches(DATE_REGEX)
    .withMessage('Pick the date of the transfer.')
    .bail()
    .isISO8601({ strict: true })
    .withMessage('Pick the date of the transfer.'),
];

const tutorIdParamRules = [param('tutorId').isInt({ min: 1 }).withMessage('Invalid tutor id.')];

// bank account rules
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
// payment method switch rules - the list of methods that stay on
const paymentMethodsRules = [
  body('enabledMethods').isArray({ max: 5 }).withMessage('Invalid payment methods.'),
  body('enabledMethods.*')
    .isIn(['BANK_TRANSFER', 'CARD', 'EZ_CASH', 'MCASH', 'PAYPAL'])
    .withMessage('Invalid payment method.'),
  body('confirmText').optional().isString().isLength({ max: 20 }),
];

// payment details rules
const paymentSettingsRules = [
  body('enabledMethods').optional().isArray({ max: 5 }).withMessage('Invalid payment methods.'),
  body('enabledMethods.*')
    .isIn(['BANK_TRANSFER', 'CARD', 'EZ_CASH', 'MCASH', 'PAYPAL'])
    .withMessage('Invalid payment method.'),
  body('confirmText').optional().isString().isLength({ max: 20 }),
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
  body('cardBankName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Bank name is too long.'),
  body('cardAccountName').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage('Account name is too long.'),
  body('cardAccountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9 -]{4,34}$/)
    .withMessage('Enter a valid account number (digits, spaces, and dashes only).'),
  body('cardBankBranch').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Branch is too long.'),
];

const payoutIdParamRules = [
  param('payoutId').isInt({ min: 1 }).withMessage('Invalid payout id.'),
];

const confirmPayoutRules = [
  param('payoutId').isInt({ min: 1 }).withMessage('Invalid payout id.'),
  body('providerReference')
    .trim()
    .isLength({ min: 3, max: 60 })
    .withMessage('Enter the reference number the bank gave for this transfer.')
    .bail()
    .matches(BANK_REFERENCE_REGEX)
    .withMessage('Reference can only contain letters, numbers, spaces, hyphens, and slashes.'),
  body('transferDate')
    .optional({ checkFalsy: true })
    .matches(DATE_REGEX)
    .withMessage('Pick the date of the transfer.')
    .bail()
    .isISO8601({ strict: true })
    .withMessage('Pick the date of the transfer.'),
];

const failPayoutRules = [
  param('payoutId').isInt({ min: 1 }).withMessage('Invalid payout id.'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Say why the transfer failed.')
    .bail()
    .isLength({ max: 255 })
    .withMessage('Keep the reason under 255 characters.'),
];

const studentSearchRules = [
  query('search').trim().isLength({ min: 1, max: 60 }).withMessage('Type a registration number or name.'),
];

// office payment rules
const recordPaymentRules = [
  body('enrollmentId').isInt({ min: 1 }).withMessage('Choose the class being paid for.'),
  amountRule('amount', 'Enter the amount the student paid.'),
  body('method').isIn(['CASH', 'BANK_DEPOSIT']).withMessage('Choose how the student paid.'),
  body('reference')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Za-z0-9 \-/]{1,40}$/)
    .withMessage('Reference can only contain letters, numbers, spaces, hyphens and slashes.'),
  body('note').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Note is too long.'),
];

module.exports = {
  studentSearchRules,
  recordPaymentRules,
  payoutIdParamRules,
  approveBankTransferRules,
  tutorIdParamRules,
  confirmPayoutRules,
  failPayoutRules,
  makePaymentRules,
  onlineCheckoutRules,
  bankTransferRules,
  editBankTransferRules,
  paymentIdParamRules,
  payTutorRules,
  bankDetailsRules,
  paymentSettingsRules,
  paymentMethodsRules,
  WALLET_PHONE_REGEX,
};
