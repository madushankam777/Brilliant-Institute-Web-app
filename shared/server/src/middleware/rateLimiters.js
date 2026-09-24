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

// blocks guessing the attendance check-in code
const checkinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a while and try again.',
  },
});

// blocks guessing a re-registration key. A key is only valid for the student
// it was issued to, so this is already narrow - the limit closes the gap.
const keyRedemptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a while, then check the key with the office.',
  },
});

module.exports = { authLimiter, apiLimiter, checkinLimiter, keyRedemptionLimiter };
