const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { toSafeUser } = require('../../../../../shared/server/src/utils/sanitize');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { ROLES, SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const { UPLOADS_ROOT_DIR } = require('../../../../../shared/server/src/middleware/upload');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const repository = require('./auth.repository');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

// ST0000001, ST0000002, ... - built from the row's own auto-increment id,
// so it's only ever known once the INSERT has actually happened.
function buildStudentCode(userId) {
  return `ST${String(userId).padStart(7, '0')}`;
}

async function registerUser({ fullName, email, password, phone, role, enrollmentKey, grade }) {
  const existing = await repository.findUserByEmail(email);
  if (existing) {
    // It's fine to say "this email is taken" on a public sign-up form -
    // unlike login, there's no security downside to telling them that here.
    throw ApiError.conflict('An account with this email already exists. Try logging in instead.');
  }

  const targetRole = role === ROLES.TUTOR ? ROLES.TUTOR : ROLES.STUDENT_PARENT;

  let consumedKey = null;
  if (targetRole === ROLES.TUTOR) {
    const normalizedKey = String(enrollmentKey || '').trim().toUpperCase();
    if (!normalizedKey) {
      throw ApiError.badRequest(
        'A tutor enrollment key from an Administrator is required to register as a Tutor.'
      );
    }
    consumedKey = await repository.findValidTutorKeyByCode(normalizedKey);
    if (!consumedKey) {
      throw ApiError.badRequest(
        'This enrollment key is invalid, already used, or has been revoked. Please contact the office.'
      );
    }
  }

  let normalizedGrade = null;
  if (targetRole === ROLES.STUDENT_PARENT) {
    if (!grade || !GRADES.includes(grade)) {
      throw ApiError.badRequest('Please select your grade.');
    }
    normalizedGrade = grade;
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
  const userId = await repository.createUser({
    fullName,
    email,
    passwordHash,
    phone,
    role: targetRole,
    grade: normalizedGrade,
  });

  if (targetRole === ROLES.STUDENT_PARENT) {
    await repository.setStudentCode(userId, buildStudentCode(userId));
  }

  if (consumedKey) {
    await repository.markTutorKeyUsed(consumedKey.id, userId);
  }

  await recordAuditEvent({
    actorId: userId,
    action: targetRole === ROLES.TUTOR ? 'TUTOR_REGISTERED' : 'USER_REGISTERED',
    entityType: 'user',
    entityId: userId,
    details: consumedKey ? { enrollmentKeyId: consumedKey.id } : undefined,
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

  const passwordMatches = await bcrypt.compare(
    password || '',
    isAccountUsable ? user.password_hash : DUMMY_PASSWORD_HASH
  );

  if (!isAccountUsable || !passwordMatches) {
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

async function updateProfile(userId, { fullName, phone, bio }) {
  const user = await repository.updateUserProfile(userId, { fullName, phone, bio });
  await recordAuditEvent({
    actorId: userId,
    action: 'PROFILE_UPDATED',
    entityType: 'user',
    entityId: userId,
  });
  return toSafeUser(user);
}

async function updateProfilePicture(userId, publicPath) {
  const existing = await repository.findUserById(userId);
  const user = await repository.updateProfilePicture(userId, publicPath);

  if (existing && existing.profile_picture_path && existing.profile_picture_path !== publicPath) {
    const oldAbsolutePath = path.join(
      UPLOADS_ROOT_DIR,
      existing.profile_picture_path.replace(/^\/uploads\//, '')
    );
    fs.unlink(oldAbsolutePath, () => {});
  }

  await recordAuditEvent({
    actorId: userId,
    action: 'PROFILE_PICTURE_UPDATED',
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
  registerUser,
  loginWithEmailAndPassword,
  logout,
  getProfile,
  updateProfile,
  updateProfilePicture,
  changePassword,
  requestPasswordReset,
  resetPasswordWithToken,
};
