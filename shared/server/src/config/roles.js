// Shared role/status enums and the session cookie name
const SESSION_COOKIE_NAME = 'bi_session';

// the three kinds of account
const ROLES = Object.freeze({
  STUDENT_PARENT: 'STUDENT_PARENT',
  TUTOR: 'TUTOR',
  ADMIN: 'ADMIN',
});

// account states - only ACTIVE accounts can log in
const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
  // set by the January roll-over when a student does not re-register
  LEFT: 'LEFT',
});

module.exports = { SESSION_COOKIE_NAME, ROLES, USER_STATUS };
