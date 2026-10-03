// Error class carrying an HTTP status code
class ApiError extends Error {
  // status code, message and optional field details
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    // extra info that is safe to show the user
    this.details = details;
  }

  // 400 - the request is wrong
  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  // 401 - not logged in
  static unauthorized(message = 'You must be logged in to do that.') {
    return new ApiError(401, message);
  }

  // 403 - logged in but not allowed
  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, message);
  }

  // 404 - does not exist
  static notFound(message = 'The requested resource was not found.') {
    return new ApiError(404, message);
  }

  // 409 - clashes with existing data, e.g. the email is taken
  static conflict(message) {
    return new ApiError(409, message);
  }

  // 429 - too many requests
  static tooMany(message = 'Too many requests. Please try again later.') {
    return new ApiError(429, message);
  }
}

module.exports = ApiError;
