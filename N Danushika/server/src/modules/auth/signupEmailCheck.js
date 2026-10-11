// sign-up email check - a 6-digit code is emailed, and the account is only made with the right code
const crypto = require('crypto');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { sendMail, canReceiveEmail } = require('../../../../../shared/server/src/utils/mailer');
const { renderEmail } = require('../../../../../shared/server/src/utils/emailLayout');

const CODE_TTL_MINUTES = 15;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
const INVALID = 'That code is wrong or has expired. Check the latest email or ask for a new code.';

// codes waiting to be used, by email (kept in memory - only the hash is stored)
const pending = new Map();

// code hash - tied to the email and the server secret
function hashCode(email, code) {
  return crypto.createHmac('sha256', config.auth.jwtSecret).update(`signup:${email}:${code}`).digest('hex');
}

// forget codes that have expired
function dropExpired() {
  const now = Date.now();
  for (const [email, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(email);
  }
}

// send code btn - email a new code (one a minute at most)
async function sendSignupCode(email, fullName) {
  dropExpired();
  const last = pending.get(email);
  if (last && Date.now() - last.sentAt < RESEND_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_SECONDS * 1000 - (Date.now() - last.sentAt)) / 1000);
    throw ApiError.tooMany(`Please wait ${wait} seconds before asking for another code.`);
  }

  // a made-up address can never get the code
  if (config.isProduction && !canReceiveEmail(email)) {
    throw ApiError.badRequest('Please use an email address you can open - we send a code to it.', [
      { field: 'email', message: 'Please use an email address you can open.' },
    ]);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pending.set(email, {
    hash: hashCode(email, code),
    expiresAt: Date.now() + CODE_TTL_MINUTES * 60 * 1000,
    sentAt: Date.now(),
    tries: 0,
  });

  // the email itself
  const { html, text } = renderEmail({
    name: fullName,
    heading: `Your sign-up code is ${code}`,
    message:
      `Enter this code on the ${config.institute.name} sign-up page to confirm your email address:\n\n${code}\n\n` +
      `It works once and expires in ${CODE_TTL_MINUTES} minutes. If you did not try to sign up, you can ignore this email.`,
  });
  try {
    const sent = await sendMail({ to: email, subject: `${code} is your ${config.institute.name} sign-up code`, html, text });
    if (sent && sent.skipped && !config.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[dev-only] sign-up code for ${email}: ${code} (this address cannot receive email)`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[mail] could not send the sign-up code to ${email}: ${error.message}`);
    if (!config.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[dev-only] sign-up code for ${email}: ${code}`);
      return;
    }
    pending.delete(email);
    throw new ApiError(503, 'We could not send the code right now. Please try again in a few minutes.');
  }
}

// check the code at sign-up - wrong codes are counted, too many cancel it
function checkSignupCode(email, code) {
  if (!config.auth.verifySignupEmail) return;
  const fieldError = (message) => ApiError.badRequest(message, [{ field: 'emailCode', message }]);
  const entry = pending.get(email);
  if (!entry || entry.expiresAt < Date.now()) throw fieldError(INVALID);
  if (!/^\d{6}$/.test(String(code || '')) || hashCode(email, String(code)) !== entry.hash) {
    entry.tries += 1;
    if (entry.tries >= MAX_TRIES) {
      pending.delete(email);
      throw fieldError('Too many wrong codes. Please ask for a new code.');
    }
    throw fieldError(INVALID);
  }
}

// the account was made - the code is used up
function forgetSignupCode(email) {
  pending.delete(email);
}

module.exports = { sendSignupCode, checkSignupCode, forgetSignupCode, CODE_TTL_MINUTES };
