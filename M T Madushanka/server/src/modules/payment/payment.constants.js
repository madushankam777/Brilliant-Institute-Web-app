// Payment status + method enums
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH', 'BANK_TRANSFER']);

// Bank transfer never goes through the mock gateway - it has its own
// POST /payments/bank-transfer route (receipt upload + Admin approval),
// so it's excluded from the instant-charge /payments route's allowed methods.
const INSTANT_PAYMENT_METHODS = Object.freeze(['CARD', 'EZ_CASH', 'MCASH']);

module.exports = { PAYMENT_STATUS, PAYMENT_METHODS, INSTANT_PAYMENT_METHODS };
