// Wraps async route handlers to forward errors
function asyncHandler(fn) {
  return function wrappedRouteHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
