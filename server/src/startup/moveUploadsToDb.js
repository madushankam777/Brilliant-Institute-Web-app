// one-time move - old files in shared/server/uploads go into MySQL, then the folder is deleted
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../../../shared/server/src/config/db');
const { hasTable } = require('../../../shared/server/src/utils/schemaFeatures');
const { UPLOADS_ROOT_DIR, resolveUploadPath } = require('../../../shared/server/src/utils/resolveUploadPath');

// file type by file extension
const MIME_BY_EXTENSION = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

// JSON text to an object, with a fallback
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// copy one old file into MySQL - returns the new path, or null if the file is gone
async function moveFile(oldPath, kind, userId) {
  if (!oldPath || !String(oldPath).startsWith('/uploads/')) return oldPath;
  const absolute = resolveUploadPath(oldPath);
  if (!fs.existsSync(absolute)) return null;
  const data = fs.readFileSync(absolute);
  const mimeType = MIME_BY_EXTENSION[path.extname(absolute).toLowerCase()] || 'application/octet-stream';
  const publicId = crypto.randomBytes(16).toString('hex');
  await pool.execute(
    `INSERT INTO uploaded_files (public_id, kind, mime_type, size_bytes, original_name, data, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [publicId, kind, mimeType, data.length, path.basename(absolute), data, userId || null]
  );
  return `/api/files/${publicId}`;
}

// run the move - profile pictures, bank slips, tutor CVs and certificates
async function moveUploadsToDb() {
  if (!fs.existsSync(UPLOADS_ROOT_DIR)) return;
  if (!(await hasTable('uploaded_files'))) return;

  let moved = 0;

  // profile pictures
  const [users] = await pool.execute(`SELECT id, profile_picture_path FROM users WHERE profile_picture_path LIKE '/uploads/%'`);
  for (const user of users) {
    const newPath = await moveFile(user.profile_picture_path, 'PROFILE_PICTURE', user.id);
    await pool.execute(`UPDATE users SET profile_picture_path = ? WHERE id = ?`, [newPath, user.id]);
    moved += newPath ? 1 : 0;
  }

  // bank slips
  const [payments] = await pool.execute(
    `SELECT id, student_id, payment_details FROM payments
     WHERE JSON_UNQUOTE(JSON_EXTRACT(payment_details, '$.receiptImagePath')) LIKE '/uploads/%'`
  );
  for (const payment of payments) {
    const details = parseJson(payment.payment_details, {});
    details.receiptImagePath = await moveFile(details.receiptImagePath, 'PAYMENT_RECEIPT', payment.student_id);
    await pool.execute(`UPDATE payments SET payment_details = ? WHERE id = ?`, [JSON.stringify(details), payment.id]);
    moved += details.receiptImagePath ? 1 : 0;
  }

  // tutor CVs and certificates
  const [keys] = await pool.execute(
    `SELECT id, created_by, cv_path, certificate_paths FROM tutor_enrollment_keys
     WHERE cv_path LIKE '/uploads/%' OR certificate_paths LIKE '%/uploads/%'`
  );
  for (const key of keys) {
    const cvPath = await moveFile(key.cv_path, 'TUTOR_DOCUMENT', key.created_by);
    const certificatePaths = [];
    for (const oldPath of parseJson(key.certificate_paths, [])) {
      const newPath = await moveFile(oldPath, 'TUTOR_DOCUMENT', key.created_by);
      if (newPath) certificatePaths.push(newPath);
    }
    await pool.execute(`UPDATE tutor_enrollment_keys SET cv_path = ?, certificate_paths = ? WHERE id = ?`, [
      cvPath,
      JSON.stringify(certificatePaths),
      key.id,
    ]);
    moved += (cvPath ? 1 : 0) + certificatePaths.length;
  }

  // everything is in MySQL now - remove the old folder
  fs.rmSync(UPLOADS_ROOT_DIR, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`[setup] Moved ${moved} uploaded file(s) into MySQL and deleted shared/server/uploads.`);
}

module.exports = { moveUploadsToDb };
