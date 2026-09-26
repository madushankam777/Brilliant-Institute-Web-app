// old uploads folder - only read while files are moved into MySQL
const path = require('path');
const ApiError = require('./ApiError');

const UPLOADS_ROOT_DIR = path.join(__dirname, '..', '..', 'uploads');

// stored /uploads path to an absolute path - never outside uploads
function resolveUploadPath(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) {
    throw ApiError.notFound('File not found.');
  }

  const relative = publicPath.replace(/^\/uploads\//, '');
  const absolute = path.resolve(UPLOADS_ROOT_DIR, relative);
  const root = path.resolve(UPLOADS_ROOT_DIR);

  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw ApiError.notFound('File not found.');
  }

  return absolute;
}

module.exports = { UPLOADS_ROOT_DIR, resolveUploadPath };
