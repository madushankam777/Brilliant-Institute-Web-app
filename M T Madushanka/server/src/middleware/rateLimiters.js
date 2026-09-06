// express-rate-limit configs
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMinutes * 60 * 1000,
  max: config.rateLimit.authMaxAttempts,
  standardHeaders: true, // return RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts from this device. Please wait a while and try again.',
  },
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMinutes * 60 * 1000,
  max: config.rateLimit.apiMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
  },
});

module.exports = { authLimiter, apiLimiter };
