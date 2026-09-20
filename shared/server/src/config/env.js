require('dotenv').config();

// Every variable in this list MUST be present in the environment (.env file)
// or the server will stop immediately with a helpful error message.
const REQUIRED_VARS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'CLIENT_ORIGIN',
];

function getMissingVars() {
  return REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === '';
  });
}

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

  // A short JWT secret is brute-forceable against the signed tokens it
  // produces - refuse to start rather than run with a weak one.
  if (process.env.JWT_SECRET.length < 32) {
    // eslint-disable-next-line no-console
    console.error(
      '\n[FATAL] JWT_SECRET is too short (must be at least 32 characters).\n' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
}

assertRequiredEnvVars();

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN,
  // CLIENT_ORIGIN may be a comma-separated list (e.g. one entry for
  // localhost and one for a LAN IP) so the same build can be reached from
  // this machine and from other devices during local/LAN testing. CORS
  // still only ever allows origins explicitly listed here - never "*".
  clientOrigins: String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Only trust X-Forwarded-For when we're actually behind a real reverse
  // proxy - otherwise a client could spoof it and dodge IP rate limits.
  trustProxy: process.env.TRUST_PROXY === 'true',

  db: {
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 3306),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
    sessionTimeoutMinutes: toInt(process.env.SESSION_TIMEOUT_MINUTES, 30),
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
    maxFailedLoginAttempts: toInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS, 5),
    accountLockoutMinutes: toInt(process.env.ACCOUNT_LOCKOUT_MINUTES, 15),
  },

  rateLimit: {
    authWindowMinutes: toInt(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15),
    authMaxAttempts: toInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 8),
    apiWindowMinutes: toInt(process.env.API_RATE_LIMIT_WINDOW_MINUTES, 15),
    apiMaxRequests: toInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 300),
  },

  business: {
    lowAttendanceThresholdPercent: toInt(
      process.env.LOW_ATTENDANCE_THRESHOLD_PERCENT,
      80
    ),
  },

  paymentGateway: {
    providerName: process.env.PAYMENT_GATEWAY_PROVIDER_NAME || 'mock-gateway',
    apiKey: process.env.PAYMENT_GATEWAY_API_KEY || '',
  },

  // PayHere - the live card / eZ Cash / mCash gateway. When merchantId and
  // merchantSecret are both set, real online payments are enabled; when they
  // are blank the app falls back to the built-in simulator so the project
  // still runs locally without credentials.
  payhere: {
    merchantId: process.env.PAYHERE_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || '',
    // 'sandbox' until you have gone through PayHere's live approval.
    mode: process.env.PAYHERE_MODE === 'live' ? 'live' : 'sandbox',
    currency: process.env.PAYHERE_CURRENCY || 'LKR',
    // The public https:// origin the browser reaches this app on. PayHere
    // sends the payer back here, and posts its server-to-server payment
    // notification to <publicBaseUrl>/api/payments/payhere/notify - so
    // "localhost" will NOT work, it must be reachable from the internet
    // (a tunnel such as ngrok/cloudflared is fine while developing).
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    // Optional override when the API is served from a different public
    // origin than the site (leave blank when Vite proxies /api).
    notifyUrlOverride: process.env.PAYHERE_NOTIFY_URL || '',
  },
};

config.payhere.isConfigured = Boolean(
  config.payhere.merchantId && config.payhere.merchantSecret && config.payhere.publicBaseUrl
);

module.exports = config;
