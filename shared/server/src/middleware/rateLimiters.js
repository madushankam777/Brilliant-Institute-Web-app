// express-rate-limit configs
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// login limiter - failed attempts per device + email
const authAttemptLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMinutes * 60 * 1000,
  max: config.rateLimit.authMaxAttempts,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}|${String((req.body && req.body.email) || '').trim().toLowerCase()}`,
  standardHeaders: true, // return RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts from this device. Please wait a while and try again.',
  },
});

// wider cap per device, so one machine can't try many different accounts
const authDeviceLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMinutes * 60 * 1000,
  max: config.rateLimit.authMaxAttempts * 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts from this device. Please wait a while and try again.',
  },
});

// login, register and reset use both limits above
const authLimiter = [authDeviceLimiter, authAttemptLimiter];

// forgot password - every request counts, so nobody can flood an inbox
const resetRequestLimiter = [
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.ip}|${String((req.body && req.body.email) || '').trim().toLowerCase()}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many code requests. Please wait a few minutes and try again.' },
  }),
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many code requests from this device. Please try again later.' },
  }),
];

// per logged-in person, so classmates on the same Wi-Fi don't block each other
function perUserKey(req) {
  return req.user ? `user-${req.user.id}` : req.ip;
}

// every request - a general cap per device
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
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a while and try again.',
  },
});

// blocks guessing a re-registration key
const keyRedemptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a while, then check the key with the office.',
  },
});

// Contact Us form - stops one visitor flooding the office inbox
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'You have sent several messages already. Please try again later or call the office.',
  },
});

// reports - building a PDF is heavy work, so cap how often one admin can do it
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many reports in a short time. Please wait a few minutes and try again.',
  },
});

module.exports = {
  resetRequestLimiter,
  authLimiter,
  apiLimiter,
  checkinLimiter,
  keyRedemptionLimiter,
  contactLimiter,
  reportLimiter,
};
