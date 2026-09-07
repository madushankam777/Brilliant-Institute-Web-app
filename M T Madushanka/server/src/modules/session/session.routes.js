// Placeholder login only (real auth module is N Danushika's)
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../../../../../shared/server/src/config/db');
const config = require('../../../../../shared/server/src/config/env');
const { SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { authLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const bcrypt = require('bcryptjs');

const router = express.Router();

// A bcrypt hash of no real password, used only so a login for a non-existent
// or inactive account still runs a comparison of the same cost - without
// this, responses for "no such user" would return measurably faster than
// "wrong password", letting an attacker detect which emails are registered.
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

// POST /api/session/login - placeholder sign-in for standalone testing only.
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, password_hash, role, status FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];
    const isAccountUsable = Boolean(user) && user.status === 'ACTIVE';

    // Always compare against a real bcrypt hash - even when there's no such
    // user - so this takes the same time either way (see DUMMY_PASSWORD_HASH).
    const passwordMatches = await bcrypt.compare(
      password || '',
      isAccountUsable ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    if (!isAccountUsable || !passwordMatches) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    issueSessionCookie(res, user);
    res.status(200).json({
      success: true,
      data: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
    });
  })
);

// POST /api/session/logout
router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(200).json({ success: true, message: 'Logged out.' });
});

// GET /api/session/me - lets the frontend know who is currently logged in.
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
