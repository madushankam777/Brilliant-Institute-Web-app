// Central 404 + error handler
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `No route found for ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isKnownError = err instanceof ApiError;
  const statusCode = isKnownError ? err.statusCode : 500;

  // Always log full details server-side for debugging / audits.
  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl} ->`, err);

  const responseBody = {
    success: false,
    message: isKnownError ? err.message : 'Something went wrong. Please try again later.',
  };

  if (isKnownError && err.details) {
    responseBody.details = err.details;
  }

  // Only ever include a stack trace outside of production, for local
  // debugging convenience.
  if (!config.isProduction && !isKnownError) {
    responseBody.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}

module.exports = { notFoundHandler, errorHandler };
