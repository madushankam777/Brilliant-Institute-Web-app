// Requires X-Requested-With on state-changing requests
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUIRED_HEADER_VALUE = 'brilliant-institute-client';

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
