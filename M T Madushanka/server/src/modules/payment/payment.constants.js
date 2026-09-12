// Payment status + method enums
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH', 'BANK_TRANSFER']);

// instant methods (bank transfer has its own route)
const INSTANT_PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH']);

module.exports = { PAYMENT_STATUS, PAYMENT_METHODS, INSTANT_PAYMENT_METHODS };
