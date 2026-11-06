// sign-up email check - a 6-digit code is emailed, and the account is only made with the right code
const crypto = require('crypto');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { sendMail, canReceiveEmail } = require('../../../../../shared/server/src/utils/mailer');
const { renderEmail } = require('../../../../../shared/server/src/utils/emailLayout');
const repository = require('./auth.repository');

const CODE_TTL_MINUTES = 15;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
const INVALID = 'That code is wrong or has expired. Check the latest email or ask for a new code.';

// code hash - tied to the email and the server secret (only the hash is saved, in signup_codes)
function hashCode(email, code) {
  return crypto.createHmac('sha256', config.auth.jwtSecret).update(`signup:${email}:${code}`).digest('hex');
}

// the codes live in MySQL - stop when that table is not there yet
async function requireTable() {
  if (!(await schema.hasSignupCodes())) throw schema.migrationRequired();
}

// send code btn - email a new code (one a minute at most)
async function sendSignupCode(email, fullName) {
  await requireTable();
  const last = await repository.findSignupCode(email);
  if (last && Number(last.seconds_ago) < RESEND_SECONDS) {
    const wait = RESEND_SECONDS - Number(last.seconds_ago);
    throw ApiError.tooMany(`Please wait ${wait} seconds before asking for another code.`);
  }

  // a made-up address can never get the code
  if (config.isProduction && !canReceiveEmail(email)) {
    throw ApiError.badRequest('Please use an email address you can open - we send a code to it.', [
      { field: 'email', message: 'Please use an email address you can open.' },
    ]);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await repository.saveSignupCode(email, hashCode(email, code), CODE_TTL_MINUTES);

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
    await repository.deleteSignupCode(email);
    throw new ApiError(503, 'We could not send the code right now. Please try again in a few minutes.');
  }
}

// check the code at sign-up - wrong codes are counted, too many cancel it
async function checkSignupCode(email, code) {
  if (!config.auth.verifySignupEmail) return;
  await requireTable();
  const fieldError = (message) => ApiError.badRequest(message, [{ field: 'emailCode', message }]);
  const entry = await repository.findSignupCode(email);
  if (!entry || !Number(entry.is_valid)) throw fieldError(INVALID);
  if (!/^\d{6}$/.test(String(code || '')) || hashCode(email, String(code)) !== entry.code_hash) {
    if (Number(entry.tries) + 1 >= MAX_TRIES) {
      await repository.deleteSignupCode(email);
      throw fieldError('Too many wrong codes. Please ask for a new code.');
    }
    await repository.addSignupCodeTry(email);
    throw fieldError(INVALID);
  }
}

// the account was made - the code is used up
async function forgetSignupCode(email) {
  if (await schema.hasSignupCodes()) await repository.deleteSignupCode(email);
}

module.exports = { sendSignupCode, checkSignupCode, forgetSignupCode, CODE_TTL_MINUTES };
