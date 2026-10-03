// payment simulator - used when PayHere is not set up (no real money moves)
const { randomUUID } = require('crypto');
const config = require('../../../../../shared/server/src/config/env');

// pretend to charge - amounts divisible by 13 are declined, divisible by 17 time out, the rest are approved
async function chargePaymentToken({ amount }) {
  // a fake transaction id
  const gatewayTransactionId = `${config.paymentGateway.providerName}_${randomUUID()}`;

  if (amount <= 0) {
    return { approved: false, gatewayTransactionId, reason: 'Invalid amount.' };
  }

  const isDeclined = amount % 13 === 0;
  if (isDeclined) {
    return { approved: false, gatewayTransactionId, reason: 'Card declined by issuing bank.' };
  }

  const isGatewayTimeout = amount % 17 === 0;
  if (isGatewayTimeout) {
    throw new Error('Payment gateway timed out. Please try again.');
  }

  return { approved: true, gatewayTransactionId, reason: null };
}

module.exports = { chargePaymentToken };
