// Verifies the session cookie, attaches req.user
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { passwordVersion, isTokenRevoked } = require('../utils/sessionToken');
const { SESSION_COOKIE_NAME, USER_STATUS } = require('../config/roles');
const { pool } = require('../config/db');

// login check - every protected route runs this first, then req.user is the logged-in person
async function authenticate(req, res, next) {
  // read the session token from the cookie
  const token = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : undefined;

  if (!token) {
    return next(ApiError.unauthorized('Please log in to continue.'));
  }

  // check the token signature and expiry
  let payload;
  try {
    // Explicitly pin the algorithm - never let the token's own header pick it.
    payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    // Covers both expired tokens and tampered/invalid signatures.
    return next(ApiError.unauthorized('Your session has expired. Please log in again.'));
  }
  // this session was logged out
  if (isTokenRevoked(token)) {
    return next(ApiError.unauthorized('Your session has expired. Please log in again.'));
  }

  // load the account from the database
  let account;
  try {
    const [rows] = await pool.execute(
      'SELECT id, role, email, status, password_hash FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );
    account = rows[0];
  } catch (error) {
    return next(error);
  }

  // suspended, deleted or closed accounts lose access straight away
  if (!account || account.status !== USER_STATUS.ACTIVE) {
    return next(ApiError.unauthorized('Your account is no longer active. Please contact an administrator.'));
  }
  // the password changed since this session started
  if (payload.pwv !== passwordVersion(account.password_hash)) {
    return next(ApiError.unauthorized('Your session has expired. Please log in again.'));
  }

  // role and email always come from the database, not the token
  req.user = {
    id: account.id,
    role: account.role,
    email: account.email,
  };
  return next();
}

module.exports = authenticate;
