// Verifies the session cookie, attaches req.user
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { SESSION_COOKIE_NAME } = require('../config/roles');

function authenticate(req, res, next) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : undefined;

  if (!token) {
    return next(ApiError.unauthorized('Please log in to continue.'));
  }

  try {
    // Explicitly pin the algorithm - never let the token's own header pick it.
    const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };
    return next();
  } catch (error) {
    // Covers both expired tokens and tampered/invalid signatures.
    return next(ApiError.unauthorized('Your session has expired. Please log in again.'));
  }
}

module.exports = authenticate;
