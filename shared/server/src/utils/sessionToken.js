// password fingerprint in the session token (new password ends old sessions)
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
