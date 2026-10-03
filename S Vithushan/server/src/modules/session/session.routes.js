// Placeholder login only
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../../../../../shared/server/src/config/db');
const config = require('../../../../../shared/server/src/config/env');
const { SESSION_COOKIE_NAME } = require('../../../../../shared/server/src/config/roles');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { authLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');

const router = express.Router();

// a fake hash, so a wrong email takes as long to check as a wrong password
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

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

// login btn - check email and password, then start the session
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    // find the account by email
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, password_hash, role, status FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];
    const isAccountUsable = Boolean(user) && user.status === 'ACTIVE';

    // check the password
    const passwordMatches = await bcrypt.compare(
      password || '',
      isAccountUsable ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    if (!isAccountUsable || !passwordMatches) {
      throw new ApiError(401, 'Invalid email or password.');
    }

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
