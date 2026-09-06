// Shared role/status enums and the session cookie name
const SESSION_COOKIE_NAME = 'bi_session';

const ROLES = Object.freeze({
  STUDENT_PARENT: 'STUDENT_PARENT',
  TUTOR: 'TUTOR',
  ADMIN: 'ADMIN',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
});

module.exports = { SESSION_COOKIE_NAME, ROLES, USER_STATUS };
