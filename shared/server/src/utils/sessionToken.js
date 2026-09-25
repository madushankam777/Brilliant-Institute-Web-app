// A short fingerprint of the user's password hash, stored in the session
// token. When the password changes the fingerprint changes, so every
// session made with the old password stops working.
const crypto = require('crypto');
const config = require('../config/env');

function passwordVersion(passwordHash) {
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(String(passwordHash || ''))
    .digest('hex')
    .slice(0, 16);
}

module.exports = { passwordVersion };
