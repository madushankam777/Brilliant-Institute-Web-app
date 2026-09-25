// Central 404 + error handler
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `No route found for ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // bad JSON, a body that is too big, etc. - the client's mistake, not a crash
  if (!(err instanceof ApiError) && err && err.type && err.status >= 400 && err.status < 500) {
    const message =
      err.status === 413 ? 'The request is too large.' : 'The request could not be read. Please try again.';
    return res.status(err.status).json({ success: false, message });
  }

  const isKnownError = err instanceof ApiError;
  const statusCode = isKnownError ? err.statusCode : 500;

  // Expected client errors (401 on a logged-out page load, wrong password,
  // validation) are already visible as a status line from the request logger;
  // only unexpected failures deserve a full stack trace in the console.
  if (!isKnownError || statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, err);
  }

  // A missing table/column means the database update has not been run yet.
  const isSchemaOutOfDate = err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR');
  if (isSchemaOutOfDate) {
    // eslint-disable-next-line no-console
    console.warn('[setup] Run sql/update_database.sql once as root in MySQL Workbench.');
  }

  const responseBody = {
    success: false,
    message: isKnownError
      ? err.message
      : isSchemaOutOfDate
        ? 'This feature is not available yet. Please contact your system administrator.'
        : 'Something went wrong. Please try again later.',
  };

  if (isKnownError && err.details) {
    responseBody.details = err.details;
  }

  // Stack traces go to the server console only - never to the browser,
  // even in development (a dev server can be reached through a tunnel).
  res.status(statusCode).json(responseBody);
}

module.exports = { notFoundHandler, errorHandler };
