// Runs express-validator results, formats 400s
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// stops the request with a 400 if any field rule failed
function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  // one message per field for the form to show
  const fieldErrors = result.array().map((error) => ({
    field: error.path,
    message: error.msg,
  }));

  return next(ApiError.badRequest('Please fix the highlighted fields.', fieldErrors));
}

module.exports = validateRequest;
