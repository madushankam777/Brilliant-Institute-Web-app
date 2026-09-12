const { randomUUID } = require('crypto');
const config = require('../../../../../shared/server/src/config/env');

async function chargePaymentToken({ amount }) {
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
