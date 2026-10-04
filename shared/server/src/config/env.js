// settings - loads server/.env, checks the required values and exports one config object
require('dotenv').config();

// Every variable in this list MUST be present in the environment
const REQUIRED_VARS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'CLIENT_ORIGIN',
];

// which required variables are missing or empty
function getMissingVars() {
  return REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === '';
  });
}

// stop the server at start-up if a required variable is missing or the secret is weak
function assertRequiredEnvVars() {
  const missing = getMissingVars();
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      '\n[FATAL] Missing required environment variables:\n' +
        missing.map((name) => `  - ${name}`).join('\n') +
        '\n\nCopy server/.env.example to server/.env and fill in real values.\n'
    );
    process.exit(1);
  }

  // refuse to start with a weak JWT secret
  if (process.env.JWT_SECRET.length < 32) {
    // eslint-disable-next-line no-console
    console.error(
      '\n[FATAL] JWT_SECRET is too short (must be at least 32 characters).\n' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
}

// run the check now
assertRequiredEnvVars();

// number from text, with a fallback
function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// TRUST_PROXY can be false, true (this machine only), a hop count or an address list
function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return 'loopback';
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

// the one config object the rest of the API reads
const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN,
  // CLIENT_ORIGIN may be a comma-separated list
  clientOrigins: String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // trust X-Forwarded-For only behind a real proxy
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // cloud hosting - the API server also serves the built website (client/dist)
  serveClient: process.env.SERVE_CLIENT === 'true',

  // database login
  db: {
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 3306),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    // cloud databases need an encrypted connection - DB_SSL=true
    ssl: process.env.DB_SSL === 'true',
    // the provider's CA certificate: file path, or the PEM text itself
    sslCa: process.env.DB_SSL_CA || '',
  },

  // login and session rules
  auth: {
    // Secure cookie - set COOKIE_SECURE=true on https
    cookieSecure:
      process.env.COOKIE_SECURE === 'true' ||
      (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production'),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
    sessionTimeoutMinutes: toInt(process.env.SESSION_TIMEOUT_MINUTES, 30),
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
    maxFailedLoginAttempts: toInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS, 5),
    accountLockoutMinutes: toInt(process.env.ACCOUNT_LOCKOUT_MINUTES, 15),
  },

  // how many requests are allowed in a time window
  rateLimit: {
    authWindowMinutes: toInt(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15),
    authMaxAttempts: toInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 8),
    apiWindowMinutes: toInt(process.env.API_RATE_LIMIT_WINDOW_MINUTES, 15),
    apiMaxRequests: toInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 1500),
  },

  // school rules
  business: {
    lowAttendanceThresholdPercent: toInt(
      process.env.LOW_ATTENDANCE_THRESHOLD_PERCENT,
      80
    ),
  },

  // institute details - used in emails and PDF reports
  institute: {
    name: 'Brilliant Institute',
    email: process.env.INSTITUTE_EMAIL || 'brilliantinstitute.edu@gmail.com',
    phone: '0112 347 728',
    address: '136, Sangamitha Mawatha, Colombo - 13',
    website: 'https://brilliantinstitute.edu.lk',
  },

  // email (password reset codes) - Gmail account + Google app password
  mail: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || '',
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    // cloud hosts that block email ports (Railway) - Resend sends over HTTPS instead
    resendApiKey: process.env.RESEND_API_KEY || '',
    from:
      process.env.MAIL_FROM ||
      `Brilliant Institute <${process.env.SMTP_USER || process.env.INSTITUTE_EMAIL || 'brilliantinstitute.edu@gmail.com'}>`,
  },

  // Google Calendar's public holiday calendar (Sri Lanka by default)
  holidays: {
    calendarId: process.env.HOLIDAY_CALENDAR_ID || 'en.lk#holiday@group.v.calendar.google.com',
  },

  // payment gateway placeholder (live card payments use the payhere settings below)
  paymentGateway: {
    providerName: process.env.PAYMENT_GATEWAY_PROVIDER_NAME || 'mock-gateway',
    apiKey: process.env.PAYMENT_GATEWAY_API_KEY || '',
  },

  // PayHere - the live card / eZ Cash / mCash gateway
  payhere: {
    merchantId: process.env.PAYHERE_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || '',
    // 'sandbox' until you have gone through PayHere's live approval.
    mode: process.env.PAYHERE_MODE === 'live' ? 'live' : 'sandbox',
    currency: process.env.PAYHERE_CURRENCY || 'LKR',
    // public https:// address (PayHere returns and notifies here)
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    // optional notify URL when the API has its own address
    notifyUrlOverride: process.env.PAYHERE_NOTIFY_URL || '',
  },

  // PayPal - card and PayPal wallet payments (sandbox for testing, live for real money)
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    secret: process.env.PAYPAL_SECRET || '',
    // 'sandbox' until you switch to a live PayPal app
    mode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
    // PayPal does not accept LKR, so fees are converted before they are sent
    currency: (process.env.PAYPAL_CURRENCY || 'USD').toUpperCase(),
    // how many rupees make one unit of that currency
    lkrPerUnit: Number(process.env.PAYPAL_LKR_RATE) > 0 ? Number(process.env.PAYPAL_LKR_RATE) : 300,
    // where PayPal sends the payer back (the website address)
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || String(process.env.CLIENT_ORIGIN || '').split(',')[0] || '')
      .trim()
      .replace(/\/+$/, ''),
  },

  // paying tutors out (PayHere only collects)
  payouts: {
    // 'BANK_FILE' or 'API'
    provider: process.env.PAYOUT_PROVIDER === 'API' ? 'API' : 'BANK_FILE',
    providerName: process.env.PAYOUT_PROVIDER_NAME || '',
    apiBaseUrl: (process.env.PAYOUT_API_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.PAYOUT_API_KEY || '',
    currency: process.env.PAYOUT_CURRENCY || 'LKR',
  },
};

// PayHere is ready only when the merchant id, secret and public address are all set
config.payhere.isConfigured = Boolean(
  config.payhere.merchantId && config.payhere.merchantSecret && config.payhere.publicBaseUrl
);

// PayPal is ready once the app keys and the website address are set
config.paypal.isConfigured = Boolean(
  config.paypal.clientId && config.paypal.secret && config.paypal.publicBaseUrl
);

module.exports = config;
