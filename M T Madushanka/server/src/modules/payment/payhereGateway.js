// PayHere gateway - card / eZ Cash / mCash payments
const crypto = require('crypto');
const config = require('../../../../../shared/server/src/config/env');

const CHECKOUT_URLS = {
  sandbox: 'https://sandbox.payhere.lk/pay/checkout',
  live: 'https://www.payhere.lk/pay/checkout',
};

// PayHere's own status codes, straight from their docs.
const STATUS = Object.freeze({
  SUCCESS: '2',
  PENDING: '0',
  CANCELED: '-1',
  FAILED: '-2',
  CHARGEDBACK: '-3',
});

// PayHere reports which instrument was actually used
const METHOD_MAP = Object.freeze({
  VISA: 'CARD',
  MASTER: 'CARD',
  AMEX: 'CARD',
  EZCASH: 'EZ_CASH',
  MCASH: 'MCASH',
});

// MD5 is required by PayHere's signature rules
function md5Upper(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex').toUpperCase();
}

function isConfigured() {
  return config.payhere.isConfigured;
}

/** PayHere wants "1000.00" - two decimals, dot separator, no grouping. */
function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

function orderIdForPayment(paymentId) {
  return `BI-${paymentId}`;
}

function paymentIdFromOrderId(orderId) {
  const match = /^BI-(\d+)$/.exec(String(orderId || ''));
  return match ? Number(match[1]) : null;
}

function notifyUrl() {
  return (
    config.payhere.notifyUrlOverride ||
    `${config.payhere.publicBaseUrl}/api/payments/payhere/notify`
  );
}

// Signed field set for the browser to POST to PayHere
function buildCheckoutRequest({ paymentId, amount, itemDescription, student }) {
  if (!isConfigured()) {
    throw new Error('PayHere is not configured.');
  }

  const orderId = orderIdForPayment(paymentId);
  const formattedAmount = formatAmount(amount);
  const currency = config.payhere.currency;

  const hash = md5Upper(
    config.payhere.merchantId +
      orderId +
      formattedAmount +
      currency +
      md5Upper(config.payhere.merchantSecret)
  );

  const nameParts = String(student.fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Student';
  const lastName = nameParts.slice(1).join(' ') || '-';

  return {
    actionUrl: CHECKOUT_URLS[config.payhere.mode],
    fields: {
      merchant_id: config.payhere.merchantId,
      return_url: `${config.payhere.publicBaseUrl}/payments/return?payment=${paymentId}`,
      cancel_url: `${config.payhere.publicBaseUrl}/payments/return?payment=${paymentId}&cancelled=1`,
      notify_url: notifyUrl(),
      order_id: orderId,
      items: itemDescription,
      currency,
      amount: formattedAmount,
      // signature so the amount can't be changed in the browser
      hash,
      first_name: firstName,
      last_name: lastName,
      email: student.email,
      // PayHere needs an address - use the institute's
      phone: student.phone || '',
      address: 'Brilliant Institute',
      city: 'Colombo',
      country: 'Sri Lanka',
    },
  };
}

// Checks that a notification really came from PayHere
function verifyNotification(body = {}) {
  const {
    merchant_id: merchantId,
    order_id: orderId,
    payhere_amount: payhereAmount,
    payhere_currency: payhereCurrency,
    status_code: statusCode,
    md5sig: signature,
  } = body;

  const expected = md5Upper(
    String(merchantId) +
      String(orderId) +
      String(payhereAmount) +
      String(payhereCurrency) +
      String(statusCode) +
      md5Upper(config.payhere.merchantSecret)
  );

  const provided = String(signature || '').toUpperCase();
  // Both sides are fixed-length hex, so a constant-time compare is cheap.
  const valid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) &&
    String(merchantId) === config.payhere.merchantId;

  const cardNo = String(body.card_no || '');

  return {
    valid,
    paymentId: paymentIdFromOrderId(orderId),
    statusCode: String(statusCode),
    amount: Number(payhereAmount),
    currency: String(payhereCurrency || ''),
    providerPaymentId: body.payment_id ? String(body.payment_id) : null,
    providerMethod: String(body.method || ''),
    mappedMethod: METHOD_MAP[String(body.method || '').toUpperCase()] || 'ONLINE',
    statusMessage: String(body.status_message || ''),
    cardHolderName: body.card_holder_name ? String(body.card_holder_name).slice(0, 100) : null,
    // PayHere sends the number already masked (************1234).
    cardLast4: cardNo ? cardNo.replace(/\D/g, '').slice(-4) : null,
  };
}

module.exports = {
  STATUS,
  isConfigured,
  formatAmount,
  orderIdForPayment,
  paymentIdFromOrderId,
  buildCheckoutRequest,
  verifyNotification,
  notifyUrl,
};
