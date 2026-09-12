// Verifies the session cookie, attaches req.user
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { SESSION_COOKIE_NAME, USER_STATUS } = require('../config/roles');
const { pool } = require('../config/db');

async function authenticate(req, res, next) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : undefined;

  if (!token) {
    return next(ApiError.unauthorized('Please log in to continue.'));
  }

  let payload;
  try {
    // Explicitly pin the algorithm - never let the token's own header pick it.
    payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    // Covers both expired tokens and tampered/invalid signatures.
    return next(ApiError.unauthorized('Your session has expired. Please log in again.'));
  }

  try {
    // check user is still active (not suspended)
    const [rows] = await pool.execute('SELECT status FROM users WHERE id = ? LIMIT 1', [
      payload.sub,
    ]);
    const currentStatus = rows[0] ? rows[0].status : null;
    if (!currentStatus || currentStatus !== USER_STATUS.ACTIVE) {
      return next(ApiError.unauthorized('Your account is no longer active. Please contact an administrator.'));
    }
  } catch (error) {
    return next(error);
  }

  req.user = {
    id: payload.sub,
    role: payload.role,
    email: payload.email,
  };
  return next();
}

module.exports = authenticate;
