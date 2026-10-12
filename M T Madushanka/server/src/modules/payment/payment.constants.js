// Payment status + method enums
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

// every payment method
const PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH', 'BANK_TRANSFER']);

const INSTANT_PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH']);

module.exports = { PAYMENT_STATUS, PAYMENT_METHODS, INSTANT_PAYMENT_METHODS };
