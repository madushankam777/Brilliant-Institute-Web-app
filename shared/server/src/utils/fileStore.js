// uploaded files are stored in MySQL (uploaded_files table), not on disk
const crypto = require('crypto');
const fs = require('fs');
const { pool } = require('../config/db');
const ApiError = require('./ApiError');
const { hasTable, migrationRequired } = require('./schemaFeatures');
const { resolveUploadPath } = require('./resolveUploadPath');

const PATH_PREFIX = '/api/files/';

function hasFileTable() {
  return hasTable('uploaded_files');
}

// "/api/files/<id>" -> "<id>"
function publicIdOf(storedPath) {
  const match = /^\/api\/files\/([0-9a-f]{32})$/.exec(String(storedPath || ''));
  return match ? match[1] : null;
}

// save btn - keep the file in MySQL, return the path to store on the record
async function saveUpload(file, kind, userId) {
  if (!(await hasFileTable())) throw migrationRequired();
  const publicId = crypto.randomBytes(16).toString('hex');
  await pool.execute(
    `INSERT INTO uploaded_files (public_id, kind, mime_type, size_bytes, original_name, data, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [publicId, kind, file.mimetype, file.buffer.length, String(file.originalname || '').slice(0, 255), file.buffer, userId || null]
  );
  return `${PATH_PREFIX}${publicId}`;
}

async function deleteUpload(storedPath) {
  const publicId = publicIdOf(storedPath);
  if (!publicId) return;
  await pool.execute(`DELETE FROM uploaded_files WHERE public_id = ?`, [publicId]);
}

// send a stored file (kind must match, so a receipt can't be read as a profile picture)
async function sendUpload(res, storedPath, kind) {
  const publicId = publicIdOf(storedPath);
  if (publicId) {
    const [rows] = await pool.execute(
      `SELECT mime_type, data FROM uploaded_files WHERE public_id = ? AND kind = ? LIMIT 1`,
      [publicId, kind]
    );
    if (!rows[0]) throw ApiError.notFound('File not found.');
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', kind === 'PROFILE_PICTURE' ? 'public, max-age=86400' : 'private, no-store');
    res.send(rows[0].data);
    return;
  }

  // old files still on disk, until they are moved into MySQL
  const absolute = resolveUploadPath(storedPath);
  if (!fs.existsSync(absolute)) throw ApiError.notFound('File not found.');
  res.sendFile(absolute);
}

module.exports = { PATH_PREFIX, hasFileTable, publicIdOf, saveUpload, deleteUpload, sendUpload };
