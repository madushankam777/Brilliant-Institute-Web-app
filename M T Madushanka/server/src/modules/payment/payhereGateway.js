// PayHere gateway - real card / eZ Cash / mCash payments.
// -----------------------------------------------------------------------
// Flow (PayHere "Checkout API"):
//   1. We create a PENDING payment row and hand the browser a signed set of
//      form fields (buildCheckoutRequest).
//   2. The browser POSTs that form to PayHere and the payer enters their
//      card there - card data never touches this server, which keeps the
//      project out of the heavy PCI-DSS scope.
//   3. PayHere POSTs the result server-to-server to our notify_url. That
//      callback - verified with verifyNotification() - is the ONLY thing
//      that marks a payment successful. The payer's browser coming back to
//      return_url proves nothing and is display-only.
//
// Money never moves "into a bank account" from here: PayHere settles to
// whichever bank account the merchant registered in their PayHere account.
//
// Spec: https://support.payhere.lk/api-&-mobile-sdk/checkout-api
// -----------------------------------------------------------------------
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

// PayHere reports which instrument was actually used. Map the ones we know
// onto this project's own method codes; anything unrecognised stays
// 'ONLINE' rather than inventing a label for it.
const METHOD_MAP = Object.freeze({
  VISA: 'CARD',
  MASTER: 'CARD',
  AMEX: 'CARD',
  EZCASH: 'EZ_CASH',
  MCASH: 'MCASH',
});

// MD5 is not a security choice we get to make - PayHere's signature
// protocol specifies it, so both directions have to use it.
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

/**
 * Signed field set for the browser to POST to PayHere.
 * Returns { actionUrl, fields } - `fields` goes into a hidden form.
 */
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
      // Proves the amount/order came from us and wasn't edited in the
      // browser on the way to PayHere. Without it PayHere rejects the
      // request outright.
      hash,
      first_name: firstName,
      last_name: lastName,
      email: student.email,
      // PayHere requires these, but a tuition class has no delivery address -
      // send the institute's own city/country rather than fake personal data.
      phone: student.phone || '',
      address: 'Brilliant Institute',
      city: 'Colombo',
      country: 'Sri Lanka',
    },
  };
}

/**
 * Checks that a notification really came from PayHere (and not from someone
 * POSTing to our public webhook). Returns a normalised result; callers must
 * treat `valid === false` as "ignore this entirely".
 */
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
