// express-rate-limit configs
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// Login / sign-up / reset: only FAILED attempts count, per device and
// email - so a whole class signing in on the institute Wi-Fi is fine, but
// guessing one account's password is not. (Accounts also lock after
// repeated wrong passwords.)
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

const authLimiter = [authDeviceLimiter, authAttemptLimiter];

// per logged-in person, so classmates on the same Wi-Fi don't block each other
function perUserKey(req) {
  return req.user ? `user-${req.user.id}` : req.ip;
}

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

// blocks guessing a re-registration key. A key is only valid for the student
// it was issued to, so this is already narrow - the limit closes the gap.
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

module.exports = { authLimiter, apiLimiter, checkinLimiter, keyRedemptionLimiter, contactLimiter };
