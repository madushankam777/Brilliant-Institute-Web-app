// password fingerprint in the session token (new password ends old sessions)
const crypto = require('crypto');
const config = require('../config/env');

// a short fingerprint of the password hash - a new password changes it and ends old sessions
function passwordVersion(passwordHash) {
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(String(passwordHash || ''))
    .digest('hex')
    .slice(0, 16);
}

// logged-out tokens, kept only until they would have expired anyway
const loggedOut = new Map();

// the ended-session list keeps a hash of the token, never the token itself
const tokenKey = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// logout - the token stops working on the server, not just in the browser
function revokeToken(token, expiresAtSeconds) {
  const now = Date.now();
  loggedOut.forEach((until, key) => {
    if (until <= now) loggedOut.delete(key);
  });
  loggedOut.set(tokenKey(token), expiresAtSeconds * 1000);
}

function isTokenRevoked(token) {
  const until = loggedOut.get(tokenKey(token));
  return Boolean(until && until > Date.now());
}

module.exports = { passwordVersion, revokeToken, isTokenRevoked };
