// payment simulator
const { randomUUID } = require('crypto');
const config = require('../../../../../shared/server/src/config/env');

const DECLINED_CARD_LAST4 = '0002';
const TIMEOUT_CARD_LAST4 = '0119';

function detailsOf(paymentDetails) {
  if (!paymentDetails) return {};
  if (typeof paymentDetails === 'string') {
    try {
      return JSON.parse(paymentDetails);
    } catch {
      return {};
    }
  }
  return paymentDetails;
}

// pretend to charge
async function chargePaymentToken({ amount, paymentMethod, paymentDetails }) {
  const gatewayTransactionId = `${config.paymentGateway.providerName}_${randomUUID()}`;

  if (!(amount > 0)) {
    return { approved: false, gatewayTransactionId, reason: 'Invalid amount.' };
  }

  const cardLast4 = paymentMethod === 'CARD' ? String(detailsOf(paymentDetails).cardLast4 || '') : '';
  if (cardLast4 === DECLINED_CARD_LAST4) {
    return { approved: false, gatewayTransactionId, reason: 'Card declined by issuing bank.' };
  }
  if (cardLast4 === TIMEOUT_CARD_LAST4) {
    throw new Error('Payment gateway timed out. Please try again.');
  }

  return { approved: true, gatewayTransactionId, reason: null };
}

module.exports = { chargePaymentToken, DECLINED_CARD_LAST4, TIMEOUT_CARD_LAST4 };
