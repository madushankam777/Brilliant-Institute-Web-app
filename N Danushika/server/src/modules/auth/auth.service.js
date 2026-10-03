const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { toSafeUser } = require('../../../../../shared/server/src/utils/sanitize');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { ROLES, SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const { resolveUploadPath } = require('../../../../../shared/server/src/utils/resolveUploadPath');
const { deleteUpload, publicIdOf } = require('../../../../../shared/server/src/utils/fileStore');
const { passwordVersion, revokeToken } = require('../../../../../shared/server/src/utils/sessionToken');
const { sendMail } = require('../../../../../shared/server/src/utils/mailer');
const { hashPassword, comparePassword, hashNow } = require('../../../../../shared/server/src/utils/passwordHasher');
const repository = require('./auth.repository');

// Same cost as real hashes
const DUMMY_PASSWORD_HASH = hashNow('not-a-real-password', config.auth.bcryptSaltRounds);

// student code, e.g. ST0000001
function buildStudentCode(userId) {
  return `ST${String(userId).padStart(7, '0')}`;
}

async function registerUser({ fullName, email, password, phone, role, enrollmentKey, grade }) {
  const existing = await repository.findUserByEmail(email);
  if (existing) {
    // sign-up can say the email is taken
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
    if (!consumedKey || !(await repository.claimTutorKey(consumedKey.id))) {
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

  const passwordHash = await hashPassword(password, config.auth.bcryptSaltRounds);
  let userId;
  try {
    userId = await repository.createUser({
      fullName,
      email,
      passwordHash,
      phone,
      role: targetRole,
      grade: normalizedGrade,
    });
  } catch (error) {
    // give the key back if the account could not be created
    if (consumedKey) await repository.releaseTutorKey(consumedKey.id);
    throw error;
  }

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

// login token - pwv logs out old sessions after a password change
function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, pwv: passwordVersion(user.password_hash) },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn, algorithm: 'HS256' }
  );
}

// Store the login token in a cookie that JavaScript can't read
function attachSessionCookie(res, token) {
  // Secure cookie on HTTPS
  const isHttps = Boolean(res.req && res.req.secure);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure || isHttps, // HTTPS-only outside local development
    sameSite: 'strict',
    maxAge: config.auth.sessionTimeoutMinutes * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// login - locks the account after too many failed attempts
async function loginWithEmailAndPassword({ email, password }, res) {
  const user = await repository.findUserByEmail(email);

  // Same error for "no such user" and "wrong password" on purpose
  const genericError = 'Invalid email or password.';
  const isAccountUsable = Boolean(user) && user.status === 'ACTIVE';

  if (isAccountUsable && user.locked_until && new Date(user.locked_until) > new Date()) {
    throw ApiError.tooMany(
      'This account is temporarily locked due to repeated failed logins. Please try again later.'
    );
  }

  const passwordMatches = await comparePassword(
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

// logout btn - also ends the token on the server, so a copied cookie stops working
function logout(req, res) {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
      revokeToken(token, payload.exp);
    } catch {
      // expired or invalid - nothing to end
    }
  }
  clearSessionCookie(res);
}

// Deletes an old upload, but never anything outside the uploads folder.
function removeUploadedFile(publicPath) {
  if (publicIdOf(publicPath)) {
    deleteUpload(publicPath).catch(() => {});
    return;
  }
  try {
    fs.unlink(resolveUploadPath(publicPath), () => {});
  } catch {
    // not an old uploads path - ignore it
  }
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
    removeUploadedFile(existing.profile_picture_path);
  }

  await recordAuditEvent({
    actorId: userId,
    action: 'PROFILE_PICTURE_UPDATED',
    entityType: 'user',
    entityId: userId,
  });

  return toSafeUser(user);
}

// delete btn - remove the current photo, going back to the initials avatar
async function removeProfilePicture(userId) {
  const existing = await repository.findUserById(userId);
  if (!existing || !existing.profile_picture_path) {
    throw ApiError.badRequest('You do not have a profile picture to remove.');
  }

  const user = await repository.updateProfilePicture(userId, null);
  removeUploadedFile(existing.profile_picture_path);

  await recordAuditEvent({
    actorId: userId,
    action: 'PROFILE_PICTURE_REMOVED',
    entityType: 'user',
    entityId: userId,
  });

  return toSafeUser(user);
}

// Change the logged-in user's own password
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await repository.findUserById(userId);
  if (!user) {
    throw ApiError.notFound('User not found.');
  }

  const passwordMatches = await comparePassword(currentPassword, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.badRequest('Your current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword, config.auth.bcryptSaltRounds);
  await repository.updatePasswordHash(userId, newHash);
  await repository.invalidateResetTokensForUser(userId);
  await recordAuditEvent({
    actorId: userId,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: userId,
  });
  return { ...user, password_hash: newHash };
}

// Re-issue the session cookie (after a password change)
function refreshSession(res, userRow) {
  attachSessionCookie(res, signSessionToken(userRow));
}

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_CODE_TTL_MINUTES = 15;
const RESET_CODE_MAX_TRIES = 5;
const RESET_CODE_RESEND_SECONDS = 60;

// wrong-code count and last send time per user (kept in memory)
const codeTries = new Map();
const lastCodeSentAt = new Map();

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// reset code hash - tied to the user and the server secret
function hashResetCode(userId, code) {
  return crypto.createHmac('sha256', config.auth.jwtSecret).update(`${userId}:${code}`).digest('hex');
}

// forgot password btn - email a 6-digit code (same answer whether or not the email exists)
async function requestPasswordReset(email) {
  const user = await repository.findUserByEmail(email);
  if (!user || user.status !== 'ACTIVE') return;

  // one code a minute at most
  const last = lastCodeSentAt.get(user.id) || 0;
  if (Date.now() - last < RESET_CODE_RESEND_SECONDS * 1000) return;
  lastCodeSentAt.set(user.id, Date.now());

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);
  await repository.invalidateResetTokensForUser(user.id);
  await repository.deleteOldResetTokensForUser(user.id);
  await repository.createPasswordResetToken(user.id, hashResetCode(user.id, code), expiresAt);
  codeTries.delete(user.id);

  await recordAuditEvent({
    actorId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId: user.id,
  });

  // sent in the background so the reply takes the same time for every email
  sendMail({
    to: user.email,
    subject: `${code} is your Brilliant Institute reset code`,
    text:
      `Hi ${user.full_name},\n\nYour password reset code is ${code}\n\n` +
      `It works once and expires in ${RESET_CODE_TTL_MINUTES} minutes. ` +
      'If you did not ask for this, you can ignore this email - your password stays the same.\n\n' +
      `Brilliant Institute\n${config.institute.address}\n${config.institute.email} | ${config.institute.phone}`,
    html: resetCodeEmail(user.full_name, code),
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[mail] could not send the reset code to ${user.email}: ${error.message}`);
    if (!config.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[dev-only] reset code for ${user.email}: ${code}`);
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// reset code email
function resetCodeEmail(name, code) {
  const { institute } = config;
  return `
  <div style="background:#f1f5f9;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#1e3a8a;padding:18px 24px;border-bottom:3px solid #c9a961">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px">Brilliant Institute</div>
        <div style="color:#cbd5e1;font-size:12px;margin-top:2px">Brilliant Makes Brilliance</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 16px">We received a request to reset your password. Enter this code on the reset page:</p>
        <div style="text-align:center;margin:20px 0">
          <span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:10px;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 20px">${code}</span>
        </div>
        <p style="margin:0 0 8px">The code works once and expires in ${RESET_CODE_TTL_MINUTES} minutes.</p>
        <p style="margin:0;color:#64748b;font-size:13px">Didn't ask for this? Ignore this email - your password stays the same. Never share this code with anyone, including our staff.</p>
      </div>
      <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">
        ${escapeHtml(institute.address)}<br>
        <a href="mailto:${institute.email}" style="color:#1d4ed8;text-decoration:none">${institute.email}</a> &nbsp;|&nbsp; ${escapeHtml(institute.phone)}
      </div>
    </div>
  </div>`;
}

// reset with code btn - check the emailed code, set the new password and log in
async function resetPasswordWithCode({ email, code, newPassword }, res) {
  const invalid = 'That code is wrong or has expired. Check the latest email or ask for a new code.';
  const user = await repository.findUserByEmail(email);
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.badRequest(invalid);
  }

  const resetToken = await repository.findValidResetTokenForUser(user.id, hashResetCode(user.id, code));
  if (!resetToken) {
    // too many wrong codes - the current code stops working
    const tries = (codeTries.get(user.id) || 0) + 1;
    codeTries.set(user.id, tries);
    if (tries >= RESET_CODE_MAX_TRIES) {
      await repository.invalidateResetTokensForUser(user.id);
      codeTries.delete(user.id);
      throw ApiError.badRequest('Too many wrong codes. Please ask for a new code.');
    }
    throw ApiError.badRequest(invalid);
  }

  const newHash = await hashPassword(newPassword, config.auth.bcryptSaltRounds);
  await repository.updatePasswordHash(user.id, newHash);
  await repository.markResetTokenUsed(resetToken.id);
  await repository.invalidateResetTokensForUser(user.id);
  await repository.resetFailedLoginCounter(user.id);
  codeTries.delete(user.id);

  await recordAuditEvent({
    actorId: user.id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: user.id,
    details: { method: 'email code' },
  });

  // log straight in with the new password
  const updatedUser = { ...user, password_hash: newHash };
  attachSessionCookie(res, signSessionToken(updatedUser));
  return toSafeUser(updatedUser);
}

// one-time reset token; only its hash is stored
async function createResetToken(userId) {
  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await repository.invalidateResetTokensForUser(userId);
  await repository.deleteOldResetTokensForUser(userId);
  await repository.createPasswordResetToken(userId, hashResetToken(rawToken), expiresAt);
  return rawToken;
}

// Finish the "forgot password" flow by using the token to set a new password.
async function resetPasswordWithToken(rawToken, newPassword) {
  const tokenHash = hashResetToken(rawToken);
  const resetToken = await repository.findValidResetTokenByHash(tokenHash);

  if (!resetToken) {
    throw ApiError.badRequest('This password reset link is invalid or has expired.');
  }

  const newHash = await hashPassword(newPassword, config.auth.bcryptSaltRounds);
  await repository.updatePasswordHash(resetToken.user_id, newHash);
  await repository.markResetTokenUsed(resetToken.id);
  await repository.invalidateResetTokensForUser(resetToken.user_id);
  // a new password also lifts any lockout from earlier failed logins
  await repository.resetFailedLoginCounter(resetToken.user_id);

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
  removeProfilePicture,
  changePassword,
  refreshSession,
  requestPasswordReset,
  resetPasswordWithCode,
  createResetToken,
  RESET_TOKEN_TTL_MINUTES,
  resetPasswordWithToken,
};
