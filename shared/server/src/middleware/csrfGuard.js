// Requires X-Requested-With on state-changing requests
const ApiError = require('../utils/ApiError');

// reading requests need no header
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// our website sends this header on every change - another website cannot
const REQUIRED_HEADER_VALUE = 'brilliant-institute-client';

// blocks changes (POST, PUT, PATCH, DELETE) that do not come from our own website
function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const headerValue = req.get('X-Requested-With');
  if (headerValue !== REQUIRED_HEADER_VALUE) {
    return next(
      ApiError.forbidden('Request blocked for security reasons. Please reload the page and try again.')
    );
  }

  return next();
}

module.exports = csrfGuard;
