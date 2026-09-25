const { pool } = require('../../../../../shared/server/src/config/db');

// Insert a brand new user account.
async function createUser({ fullName, email, passwordHash, phone, role, grade }) {
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, phone, role, grade, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
    [fullName, email, passwordHash, phone || null, role, grade || null]
  );
  return result.insertId;
}

// set student code (ST0000001...) after createUser gives us the id
async function setStudentCode(userId, studentCode) {
  await pool.execute(`UPDATE users SET student_code = ? WHERE id = ?`, [studentCode, userId]);
}

// Find a user by email - used for login and checking if an email is taken.
async function findUserByEmail(email) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

// Find a user by id - used for "my profile" and by the login-check middleware.
async function findUserById(id) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function updateUserProfile(id, { fullName, phone, bio }) {
  await pool.execute(
    `UPDATE users SET full_name = ?, phone = ?, bio = ?, updated_at = NOW() WHERE id = ?`,
    [fullName, phone || null, bio || null, id]
  );
  return findUserById(id);
}

async function findUserByStudentCode(studentCode) {
  const [rows] = await pool.execute(`SELECT * FROM users WHERE student_code = ? LIMIT 1`, [
    studentCode,
  ]);
  return rows[0] || null;
}

// Save the path to a newly uploaded profile picture.
async function updateProfilePicture(id, profilePicturePath) {
  await pool.execute(
    `UPDATE users SET profile_picture_path = ?, updated_at = NOW() WHERE id = ?`,
    [profilePicturePath, id]
  );
  return findUserById(id);
}

// Save a new password hash (used when changing or resetting a password).
async function updatePasswordHash(id, passwordHash) {
  await pool.execute(
    `UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
    [passwordHash, id]
  );
}

// Track failed logins so we can lock the account after too many attempts.
async function recordFailedLogin(id, attempts, lockedUntil) {
  await pool.execute(
    `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`,
    [attempts, lockedUntil, id]
  );
}

async function resetFailedLoginCounter(id) {
  await pool.execute(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
     WHERE id = ?`,
    [id]
  );
}

// Save a password-reset token (only its hash is stored, never the raw token).
async function createPasswordResetToken(userId, tokenHash, expiresAt) {
  await pool.execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, NOW())`,
    [userId, tokenHash, expiresAt]
  );
}

// Find a reset token by its hash, but only if it's still valid (not used, not expired).
async function findValidResetTokenByHash(tokenHash) {
  const [rows] = await pool.execute(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

// Mark a reset token as used, so it can't be used again.
async function markResetTokenUsed(tokenId) {
  await pool.execute(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`, [tokenId]);
}

// A new link (or a finished reset) cancels every older link for that user.
async function invalidateResetTokensForUser(userId) {
  await pool.execute(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );
}

// Find a tutor enrollment key by its code, but only if it's still usable -
// same "valid means unused" shape as findValidResetTokenByHash above.
async function findValidTutorKeyByCode(keyCode) {
  const [rows] = await pool.execute(
    `SELECT * FROM tutor_enrollment_keys WHERE key_code = ? AND status = 'UNUSED' LIMIT 1`,
    [keyCode]
  );
  return rows[0] || null;
}

// Mark a tutor enrollment key as used, so it can't be redeemed a second
// time, and record which account redeemed it.
async function markTutorKeyUsed(keyId, userId) {
  await pool.execute(
    `UPDATE tutor_enrollment_keys SET status = 'USED', used_by = ?, used_at = NOW() WHERE id = ?`,
    [userId, keyId]
  );
}

// Claims the key before the account is created, so two sign-ups racing
// with the same key can't both get through. Returns false if already taken.
async function claimTutorKey(keyId) {
  const [result] = await pool.execute(
    `UPDATE tutor_enrollment_keys SET status = 'USED', used_at = NOW() WHERE id = ? AND status = 'UNUSED'`,
    [keyId]
  );
  return result.affectedRows === 1;
}

async function releaseTutorKey(keyId) {
  await pool.execute(
    `UPDATE tutor_enrollment_keys SET status = 'UNUSED', used_at = NULL WHERE id = ? AND used_by IS NULL`,
    [keyId]
  );
}

module.exports = {
  createUser,
  setStudentCode,
  findUserByEmail,
  findUserById,
  findUserByStudentCode,
  updateUserProfile,
  updateProfilePicture,
  updatePasswordHash,
  recordFailedLogin,
  resetFailedLoginCounter,
  createPasswordResetToken,
  findValidResetTokenByHash,
  markResetTokenUsed,
  invalidateResetTokensForUser,
  findValidTutorKeyByCode,
  markTutorKeyUsed,
  claimTutorKey,
  releaseTutorKey,
};
