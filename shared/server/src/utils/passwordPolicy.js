// Password strength rule (unused in this module)
const MIN_LENGTH = 8;

const STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const PASSWORD_RULE_MESSAGE =
  `Password must be at least ${MIN_LENGTH} characters long and include ` +
  'at least one uppercase letter, one lowercase letter, and one number.';

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < MIN_LENGTH) return false;
  return STRENGTH_REGEX.test(password);
}

module.exports = { MIN_LENGTH, PASSWORD_RULE_MESSAGE, isStrongPassword };
