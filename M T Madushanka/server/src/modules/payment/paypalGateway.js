// PayPal gateway - card and PayPal wallet payments (REST Orders v2)
const config = require('../../../../../shared/server/src/config/env');

const API_BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const TIMEOUT_MS = 20000;

function isConfigured() {
  return config.paypal.isConfigured;
}

function apiBase() {
  return API_BASE[config.paypal.mode] || API_BASE.sandbox;
}

let cachedToken = { value: '', expiresAt: 0 };

// log in to PayPal with the client id and secret
async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.secret}`).toString('base64');
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`PayPal login failed (${response.status}). Check PAYPAL_CLIENT_ID and PAYPAL_SECRET.`);
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in || 600) - 60) * 1000,
  };
  return cachedToken.value;
}

async function callPayPal(path, { method = 'GET', body, requestId } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;

  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const issue = ((data.details || [])[0] || {}).issue || data.name || `HTTP ${response.status}`;
    const error = new Error(data.message || `PayPal request failed (${response.status}).`);
    error.issue = String(issue);
    error.status = response.status;
    throw error;
  }
  return data;
}

// LKR to the PayPal currency
function toProviderAmount(amountLkr) {
  const converted =
    config.paypal.currency === 'LKR' ? Number(amountLkr) : Number(amountLkr) / config.paypal.lkrPerUnit;
  return Math.max(0.01, Number(converted)).toFixed(2);
}

function conversionNote(amountLkr) {
  if (config.paypal.currency === 'LKR') return null;
  const value = toProviderAmount(amountLkr);
  return `LKR ${Number(amountLkr).toFixed(2)} is charged as ${config.paypal.currency} ${value} (1 ${config.paypal.currency} = LKR ${config.paypal.lkrPerUnit}).`;
}

function approveLinkOf(order) {
  const links = Array.isArray(order.links) ? order.links : [];
  const link =
    links.find((item) => item.rel === 'payer-action') || links.find((item) => item.rel === 'approve');
  return link ? link.href : null;
}

function readCapture(order) {
  const unit = (order.purchase_units || [])[0] || {};
  const capture = ((unit.payments || {}).captures || [])[0] || {};
  const payer = order.payer || {};
  const name = payer.name || {};

  return {
    completed: String(order.status) === 'COMPLETED' && String(capture.status) === 'COMPLETED',
    orderStatus: String(order.status || ''),
    captureStatus: String(capture.status || ''),
    captureId: capture.id || null,
    amount: capture.amount ? Number(capture.amount.value) : null,
    currency: capture.amount ? String(capture.amount.currency_code) : '',
    paymentId: unit.custom_id ? Number(unit.custom_id) : null,
    payerEmail: payer.email_address ? String(payer.email_address).slice(0, 190) : null,
    payerName: `${name.given_name || ''} ${name.surname || ''}`.trim() || null,
  };
}

// Step 1 - ask PayPal for an order
async function createOrder({ paymentId, amount, description, baseUrl }) {
  if (!isConfigured()) {
    throw new Error('PayPal is not configured.');
  }

  const site = (baseUrl || config.paypal.publicBaseUrl).replace(/\/+$/, '');
  const returnUrl = `${site}/api/payments/paypal/return?payment=${paymentId}`;
  const cancelUrl = `${site}/api/payments/paypal/cancel?payment=${paymentId}`;
  const providerAmount = toProviderAmount(amount);

  const order = await callPayPal('/v2/checkout/orders', {
    method: 'POST',
    requestId: `bi-order-${paymentId}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `BI-${paymentId}`,
          custom_id: String(paymentId),
          description: String(description || 'Tuition fee').slice(0, 127),
          amount: { currency_code: config.paypal.currency, value: providerAmount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Brilliant Institute',
            landing_page: 'LOGIN',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });

  const approveUrl = approveLinkOf(order);
  if (!order.id || !approveUrl) {
    throw new Error('PayPal did not return a checkout link.');
  }

  return {
    orderId: String(order.id),
    approveUrl,
    providerAmount,
    providerCurrency: config.paypal.currency,
  };
}

async function getOrder(orderId) {
  return callPayPal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

// take the money
async function captureOrder(orderId) {
  try {
    const order = await callPayPal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      requestId: `bi-capture-${orderId}`,
      body: {},
    });
    return readCapture(order);
  } catch (error) {
    if (error.issue === 'ORDER_ALREADY_CAPTURED') {
      return readCapture(await getOrder(orderId));
    }
    if (error.issue === 'ORDER_NOT_APPROVED' || error.issue === 'PAYER_ACTION_REQUIRED') {
      return {
        completed: false,
        orderStatus: 'NOT_APPROVED',
        reason: 'The payment was not approved on PayPal.',
      };
    }
    throw error;
  }
}

module.exports = {
  isConfigured,
  toProviderAmount,
  conversionNote,
  createOrder,
  getOrder,
  captureOrder,
  readCapture,
};
