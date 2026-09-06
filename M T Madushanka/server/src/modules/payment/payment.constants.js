// Payment status + method enums
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const PAYMENT_METHODS = Object.freeze(['CARD', 'BANK_TRANSFER']);

module.exports = { PAYMENT_STATUS, PAYMENT_METHODS };
