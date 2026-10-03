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

// every report route is for admins only
router.use(authenticate, authorize(ROLES.ADMIN));

// the list of reports
router.get('/', controller.listReports);
// choices for the report form - tutors, students, classes and grades
router.get('/options', controller.getOptions);
// recent reports (read from the audit log)
router.get('/history', controller.getHistory);
// generate btn - build the report and show it on screen (60 reports per 10 minutes)
router.get('/:type', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.generateReport);
// download PDF btn
router.get('/:type/pdf', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadReportPdf);
// download Excel btn
router.get('/:type/xlsx', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadReportExcel);
// download ZIP btn - one PDF per tutor or student
router.get('/:type/zip', reportLimiter, reportTypeRules, reportQueryRules, validateRequest, controller.downloadPeopleZip);

module.exports = router;
