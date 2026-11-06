// password fingerprint in the session token (new password ends old sessions)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { SESSION_COOKIE_NAME } = require('../config/roles');
const { pool } = require('../config/db');
const schema = require('./schemaFeatures');

// a short fingerprint of the password hash - a new password changes it and ends old sessions
function passwordVersion(passwordHash) {
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(String(passwordHash || ''))
    .digest('hex')
    .slice(0, 16);
}

// the ended-session list (revoked_sessions in MySQL) keeps a hash of the token, never the token itself
const tokenKey = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// logout - the token stops working on the server, not just in the browser (kept until it would expire anyway)
async function revokeToken(token, expiresAtSeconds) {
  if (!(await schema.hasRevokedSessions())) return;
  await pool.execute('DELETE FROM revoked_sessions WHERE expires_at <= NOW()');
  await pool.execute(
    'INSERT IGNORE INTO revoked_sessions (token_hash, expires_at) VALUES (?, FROM_UNIXTIME(?))',
    [tokenKey(token), expiresAtSeconds]
  );
}

// was this session ended with Log out?
async function isTokenRevoked(token) {
  if (!(await schema.hasRevokedSessions())) return false;
  const [rows] = await pool.execute(
    'SELECT 1 FROM revoked_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1',
    [tokenKey(token)]
  );
  return rows.length > 0;
}

// login token - pwv logs out old sessions after a password change
function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, pwv: passwordVersion(user.password_hash) },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn, algorithm: 'HS256' }
  );
}

// the login cookie - no Max-Age, so it ends when the browser is closed
function setSessionCookie(res, token) {
  const isHttps = Boolean(res.req && res.req.secure);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure || isHttps,
    sameSite: 'strict',
    path: '/',
  });
}

// an active user gets a fresh token once half the time is used, so only idle sessions expire
function renewIfHalfUsed(res, payload, account) {
  if (!payload.iat || !payload.exp) return;
  const lifetime = payload.exp - payload.iat;
  const used = Math.floor(Date.now() / 1000) - payload.iat;
  if (used >= lifetime / 2) setSessionCookie(res, signSessionToken(account));
}

module.exports = {
  passwordVersion,
  revokeToken,
  isTokenRevoked,
  signSessionToken,
  setSessionCookie,
  renewIfHalfUsed,
};
