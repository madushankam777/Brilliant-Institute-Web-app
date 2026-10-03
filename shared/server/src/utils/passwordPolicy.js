// Password strength rule
const MIN_LENGTH = 8;
// bcrypt ignores anything past 72 bytes
const MAX_LENGTH = 72;

// needs a lowercase letter, an uppercase letter and a digit
const STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

// the message shown when a password is too weak
const PASSWORD_RULE_MESSAGE =
  `Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters long and include ` +
  'at least one uppercase letter, one lowercase letter, and one number.';

// true when the password is 8-72 characters with upper case, lower case and a number
function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) return false;
  return STRENGTH_REGEX.test(password);
}

module.exports = { MIN_LENGTH, MAX_LENGTH, PASSWORD_RULE_MESSAGE, isStrongPassword };
