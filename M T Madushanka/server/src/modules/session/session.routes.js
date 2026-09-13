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


const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

function issueSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.auth.jwtExpiresIn,
  });
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: config.auth.sessionTimeoutMinutes * 60 * 1000,
  });
}


// register btn - Student/Parent only, tutors need an Admin-issued key
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { fullName, email, phone, password, grade } = req.body;

    if (!fullName || String(fullName).trim().length < 2) {
      throw ApiError.badRequest('Please enter your full name.');
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw ApiError.badRequest('Please enter a valid email address.');
    }
    if (!isStrongPassword(password)) {
      throw ApiError.badRequest(PASSWORD_RULE_MESSAGE);
    }
    if (!grade || !GRADES.includes(grade)) {
      throw ApiError.badRequest('Please select your grade.');
    }

    const [existingRows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingRows[0]) {
      throw ApiError.conflict('An account with this email already exists. Try logging in instead.');
    }

    const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, phone, role, grade, status, created_at)
       VALUES (?, ?, ?, ?, 'STUDENT_PARENT', ?, 'ACTIVE', NOW())`,
      [fullName, email, passwordHash, phone || null, grade]
    );
    const userId = result.insertId;
    const studentCode = `ST${String(userId).padStart(7, '0')}`;
    await pool.execute('UPDATE users SET student_code = ? WHERE id = ?', [studentCode, userId]);

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role FROM users WHERE id = ?',
      [userId]
    );
    const user = rows[0];

    issueSessionCookie(res, user);
    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
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

    issueSessionCookie(res, user);
    res.status(200).json({
      success: true,
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(200).json({ success: true, message: 'Logged out.' });
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (!token) throw new ApiError(401, 'Not logged in.');

    let payload;
    try {
      payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
    } catch (error) {
      throw new ApiError(401, 'Session expired.');
    }

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
