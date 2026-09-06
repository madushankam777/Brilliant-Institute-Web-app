// Role-based access control guard
const ApiError = require('../utils/ApiError');

function authorize(...allowedRoles) {
  return function roleCheck(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}

module.exports = authorize;
