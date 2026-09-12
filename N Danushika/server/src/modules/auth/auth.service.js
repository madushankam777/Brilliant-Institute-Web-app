// Business logic for registration, login, profile, and password reset.
// This file never touches req/res directly, so it stays easy to test -
// the controller handles HTTP, this file handles the actual rules.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { toSafeUser } = require('../../../../../shared/server/src/utils/sanitize');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { ROLES, SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const repository = require('./auth.repository');

// A bcrypt hash of no real password, compared against when the account
// doesn't exist (or isn't usable) so a login attempt takes the same amount
// of time either way - without this, "no such user" would return
// measurably faster than "wrong password", letting an attacker enumerate
// registered emails via response timing even though the error message
// itself is identical.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Create a new Student/Parent account.
async function registerStudentParent({ fullName, email, password, phone }) {
  const existing = await repository.findUserByEmail(email);
  if (existing) {
    // It's fine to say "this email is taken" on a public sign-up form -
    // unlike login, there's no security downside to telling them that here.
    throw ApiError.conflict('An account with this email already exists. Try logging in instead.');
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
  const userId = await repository.createUser({
    fullName,
    email,
    passwordHash,
    phone,
    role: ROLES.STUDENT_PARENT,
  });

  await recordAuditEvent({
    actorId: userId,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: userId,
  });

  const user = await repository.findUserById(userId);
  return toSafeUser(user);
}

// Create a signed login token for this user.
function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );
}

// Store the login token in a cookie that JavaScript can't read and that
// only gets sent back to our own site (httpOnly + SameSite=Strict).
function attachSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction, // HTTPS-only outside local development
    sameSite: 'strict',
    maxAge: config.auth.sessionTimeoutMinutes * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// Check email + password and log the user in, with lockout after too many
// failed attempts.
async function loginWithEmailAndPassword({ email, password }, res) {
  const user = await repository.findUserByEmail(email);

  // Same error for "no such user" and "wrong password" on purpose, so a
  // login attempt can't be used to guess which emails are registered.
  const genericError = 'Invalid email or password.';
  const isAccountUsable = Boolean(user) && user.status === 'ACTIVE';

  if (isAccountUsable && user.locked_until && new Date(user.locked_until) > new Date()) {
    throw ApiError.tooMany(
      'This account is temporarily locked due to repeated failed logins. Please try again later.'
    );
  }

  // Always compare against a real bcrypt hash - even when there's no such
  // user, or the account isn't active - so this takes the same time either
  // way (see DUMMY_PASSWORD_HASH above).
  const passwordMatches = await bcrypt.compare(
    password || '',
    isAccountUsable ? user.password_hash : DUMMY_PASSWORD_HASH
  );

  if (!isAccountUsable || !passwordMatches) {
    // Only a real, active account has a row to update / an id to log
    // against - there's nothing to record for an email that isn't
    // registered (or belongs to a suspended/deleted account).
    if (user) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const shouldLock = attempts >= config.auth.maxFailedLoginAttempts;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + config.auth.accountLockoutMinutes * 60 * 1000)
        : null;
      await repository.recordFailedLogin(user.id, attempts, lockedUntil);
      await recordAuditEvent({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
      });
    }
    throw ApiError.unauthorized(genericError);
  }

  await repository.resetFailedLoginCounter(user.id);
  await recordAuditEvent({
    actorId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
  });

  const token = signSessionToken(user);
  attachSessionCookie(res, token);

  return toSafeUser(user);
}

function logout(res) {
  clearSessionCookie(res);
}

// Get the logged-in user's own profile.
async function getProfile(userId) {
  const user = await repository.findUserById(userId);
  if (!user) {
    throw ApiError.notFound('User not found.');
  }
  return toSafeUser(user);
}

// Update the logged-in user's own name/phone.
async function updateProfile(userId, { fullName, phone }) {
  const user = await repository.updateUserProfile(userId, { fullName, phone });
  await recordAuditEvent({
    actorId: userId,
    action: 'PROFILE_UPDATED',
    entityType: 'user',
    entityId: userId,
  });
  return toSafeUser(user);
}

// Change the logged-in user's own password (must know the current one).
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await repository.findUserById(userId);
  if (!user) {
    throw ApiError.notFound('User not found.');
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.badRequest('Your current password is incorrect.');
  }

  const newHash = await bcrypt.hash(newPassword, config.auth.bcryptSaltRounds);
  await repository.updatePasswordHash(userId, newHash);
  await recordAuditEvent({
    actorId: userId,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: userId,
  });
}

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Start a "forgot password" flow. Always responds the same way whether
// or not the email is registered, so this can't be used to guess emails.
// Returns the raw token only outside production, as a stand-in for a
// real email service that would send this link instead.
async function requestPasswordReset(email) {
  const user = await repository.findUserByEmail(email);

  if (user) {
    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await repository.createPasswordResetToken(user.id, tokenHash, expiresAt);
    await recordAuditEvent({
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'user',
      entityId: user.id,
    });

    if (!config.isProduction) {
      // Replace this with a real email/SMS send once a provider is chosen.
      // eslint-disable-next-line no-console
      console.log(`[dev-only] Password reset token for ${email}: ${rawToken}`);
      return { devOnlyResetToken: rawToken };
    }
  }

  return {};
}

// Finish the "forgot password" flow by using the token to set a new password.
async function resetPasswordWithToken(rawToken, newPassword) {
  const tokenHash = hashResetToken(rawToken);
  const resetToken = await repository.findValidResetTokenByHash(tokenHash);

  if (!resetToken) {
    throw ApiError.badRequest('This password reset link is invalid or has expired.');
  }

  const newHash = await bcrypt.hash(newPassword, config.auth.bcryptSaltRounds);
  await repository.updatePasswordHash(resetToken.user_id, newHash);
  await repository.markResetTokenUsed(resetToken.id);

  await recordAuditEvent({
    actorId: resetToken.user_id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: resetToken.user_id,
  });
}

module.exports = {
  registerStudentParent,
  loginWithEmailAndPassword,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPasswordWithToken,
};
