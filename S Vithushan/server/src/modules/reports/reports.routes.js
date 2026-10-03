// /api/admin/reports - admin only
const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { reportLimiter } = require('../../../../../shared/server/src/middleware/rateLimiters');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./reports.controller');
const { reportTypeRules, reportQueryRules } = require('./reports.validation');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', controller.listReports);
router.get('/options', controller.getOptions);
router.get('/history', controller.getHistory);
router.get('/:type', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.generateReport);
router.get('/:type/pdf', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadReportPdf);
router.get('/:type/xlsx', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadReportExcel);
router.get('/:type/zip', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadPeopleZip);

module.exports = router;
