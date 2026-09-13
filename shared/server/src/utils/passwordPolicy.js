// Password strength rule
const MIN_LENGTH = 8;
// bcrypt silently ignores anything past 72 bytes, so a longer password
// gives no extra security and two different passwords could hash the
// same - reject before that point instead of allowing false confidence.
const MAX_LENGTH = 72;

const STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const PASSWORD_RULE_MESSAGE =
  `Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters long and include ` +
  'at least one uppercase letter, one lowercase letter, and one number.';

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) return false;
  return STRENGTH_REGEX.test(password);
}

module.exports = { MIN_LENGTH, MAX_LENGTH, PASSWORD_RULE_MESSAGE, isStrongPassword };
