// placeholder login for this module's standalone app (the combined site uses the auth module instead)
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../../../../../shared/server/src/config/db');
const config = require('../../../../../shared/server/src/config/env');
const { SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { authLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const { isStrongPassword, PASSWORD_RULE_MESSAGE } = require('../../../../../shared/server/src/utils/passwordPolicy');
const bcrypt = require('bcryptjs');

const router = express.Router();


// a fake hash, so a wrong email takes as long to check as a wrong password
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Letters, spaces, apostrophes, periods, and hyphens only
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
// Digits plus the punctuation real phone numbers are written with.
const PHONE_REGEX = /^[0-9+\-\s()]+$/;

// start a session - a signed token in an httpOnly cookie
function issueSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.auth.jwtExpiresIn,
  });
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'strict',
    maxAge: config.auth.sessionTimeoutMinutes * 60 * 1000,
  });
}


// register btn - Student/Parent, or Tutor with an Admin-issued enrollment key
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { fullName, email, phone, password, grade, role, enrollmentKey } = req.body;
    const targetRole = role === 'TUTOR' ? 'TUTOR' : 'STUDENT_PARENT';

    // check each field - name, phone, email, password and grade
    const trimmedFullName = String(fullName || '').trim();
    if (trimmedFullName.length < 2 || trimmedFullName.length > 150) {
      throw ApiError.badRequest('Full name must be between 2 and 150 characters.');
    }
    if (!NAME_REGEX.test(trimmedFullName)) {
      throw ApiError.badRequest(
        'Full name can only contain letters, spaces, apostrophes, periods, and hyphens - no numbers or symbols.'
      );
    }
    if (phone && !PHONE_REGEX.test(String(phone).trim())) {
      throw ApiError.badRequest('Phone number can only contain digits, spaces, and the symbols + - ( ).');
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw ApiError.badRequest('Please enter a valid email address.');
    }
    if (!isStrongPassword(password)) {
      throw ApiError.badRequest(PASSWORD_RULE_MESSAGE);
    }
    if (targetRole === 'STUDENT_PARENT' && (!grade || !GRADES.includes(grade))) {
      throw ApiError.badRequest('Please select your grade.');
    }

    // tutor sign-up needs a one-time key an Admin generated for them
    let tutorKey = null;
    if (targetRole === 'TUTOR') {
      const normalizedKey = String(enrollmentKey || '').trim().toUpperCase();
      if (!normalizedKey) {
        throw ApiError.badRequest(
          'A tutor enrollment key from an Administrator is required to register as a Tutor.'
        );
      }
      const [keyRows] = await pool.execute(
        `SELECT * FROM tutor_enrollment_keys WHERE key_code = ? AND status = 'UNUSED' LIMIT 1`,
        [normalizedKey]
      );
      tutorKey = keyRows[0] || null;
      if (!tutorKey) {
        throw ApiError.badRequest(
          'This enrollment key is invalid, already used, or has been revoked. Please contact the office.'
        );
      }
    }

    // no two accounts with the same email
    const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingRows[0]) {
      throw ApiError.conflict('An account with this email already exists. Try logging in instead.');
    }

    // save the account with a hashed password
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, phone, role, grade, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
      [trimmedFullName, email, passwordHash, phone || null, targetRole, targetRole === 'STUDENT_PARENT' ? grade : null]
    );
    const userId = result.insertId;

    // students get their ST code
    if (targetRole === 'STUDENT_PARENT') {
      const studentCode = `ST${String(userId).padStart(7, '0')}`;
      await pool.execute('UPDATE users SET student_code = ? WHERE id = ?', [studentCode, userId]);
    }

    // tutor key used - tie it to the new account
    if (tutorKey) {
      await pool.execute(
        `UPDATE tutor_enrollment_keys SET status = 'USED', used_by = ?, used_at = NOW() WHERE id = ?`,
        [userId, tutorKey.id]
      );
    }

    // audit log - who registered
    await recordAuditEvent({
      actorId: userId,
      action: targetRole === 'TUTOR' ? 'TUTOR_REGISTERED' : 'USER_REGISTERED',
      entityType: 'user',
      entityId: userId,
    });

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role FROM users WHERE id = ?',
      [userId]
    );
    const user = rows[0];

    // log the new user in straight away
    issueSessionCookie(res, user);
    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

// login btn - check email and password, lock the account after too many wrong tries
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    // find the account by email
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, password_hash, role, status,
              failed_login_attempts, locked_until
       FROM users WHERE email = ?`,
      [email]
    );
    const user = rows[0];

    // same error for "no such user" and "wrong password" - don't leak which emails exist
    const genericError = 'Invalid email or password.';
    const isAccountUsable = Boolean(user) && user.status === 'ACTIVE';

    // stop if the account is still locked
    if (isAccountUsable && user.locked_until && new Date(user.locked_until) > new Date()) {
      throw ApiError.tooMany(
        'This account is temporarily locked due to repeated failed logins. Please try again later.'
      );
    }

    // check the password
    const passwordMatches = await bcrypt.compare(
      password || '',
      isAccountUsable ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    // wrong password - count the failure and lock the account after too many
    if (!isAccountUsable || !passwordMatches) {
      if (user) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const shouldLock = attempts >= config.auth.maxFailedLoginAttempts;
        const lockedUntil = shouldLock
          ? new Date(Date.now() + config.auth.accountLockoutMinutes * 60 * 1000)
          : null;
        await pool.execute(
          `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`,
          [attempts, lockedUntil, user.id]
        );
        await recordAuditEvent({
          actorId: user.id,
          action: 'LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
        });
      }
      throw new ApiError(401, genericError);
    }

    // right password - clear the failed tries
    await pool.execute(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = ?`,
      [user.id]
    );
    await recordAuditEvent({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
    });

    // start the session
    issueSessionCookie(res, user);
    res.status(200).json({
      success: true,
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

// logout btn - remove the session cookie
router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(200).json({ success: true, message: 'Logged out.' });
});

// who am I - the logged-in user, read from the session cookie
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    // read the session token
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (!token) throw new ApiError(401, 'Not logged in.');

    // check the token signature and expiry
    let payload;
    try {
      payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    } catch (error) {
      throw new ApiError(401, 'Session expired.');
    }

    // load the account - it must still be active
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role, status FROM users WHERE id = ?',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || user.status !== 'ACTIVE') {
      throw new ApiError(401, 'Session expired.');
    }
    res.status(200).json({
      success: true,
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

module.exports = router;
