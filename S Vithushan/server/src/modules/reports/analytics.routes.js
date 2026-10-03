// /api/admin/analytics - admin only
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { reportLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const { reportQueryRules } = require('./reports.validation');
const { getAnalytics } = require('./analytics.service');

const router = express.Router();

// analytics is for admins only
router.use(authenticate, authorize(ROLES.ADMIN));

// analytics dashboard data for a period
router.get(
  '/',
  reportLimiter,
  reportQueryRules,
  validateRequest,
  asyncHandler(async (req, res) => {
    const analytics = await getAnalytics({ from: req.query.from, to: req.query.to });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: { analytics } });
  })
);

module.exports = router;
