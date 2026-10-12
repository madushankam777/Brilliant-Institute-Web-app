// report endpoints
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./reports.service');
const { renderReportPdfInWorker } = require('./reportPdf');
const { renderReportExcel } = require('./reportExcel');

// reports page - list of reports
const listReports = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { reports: await service.getCatalog() } });
});

// tutor / student / class choices for the report form
const getOptions = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { options: await service.getOptions() } });
});

// recent reports list
const getHistory = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { history: await service.getHistory() } });
});

// delete btn - one recent report
const removeHistoryEntry = asyncHandler(async (req, res) => {
  await service.removeHistory(req.user, [Number(req.params.id)]);
  res.status(200).json({ success: true, message: 'Report removed from the list.' });
});

// delete all btn - every recent report
const clearHistory = asyncHandler(async (req, res) => {
  const removed = await service.removeHistory(req.user, null);
  res.status(200).json({ success: true, message: removed ? 'Recent reports cleared.' : 'There were no reports to clear.', data: { removed } });
});

// generate btn - report shown on screen
const generateReport = asyncHandler(async (req, res) => {
  const report = await service.buildReport(req.params.type, req.query, req.user);
  await service.recordUse(req.user, report, 'view');
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { report } });
});

// download pdf btn
const downloadReportPdf = asyncHandler(async (req, res) => {
  const report = await service.buildReport(req.params.type, req.query, req.user);
  const pdf = await renderReportPdfInWorker(report);
  await service.recordUse(req.user, report, 'pdf');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${service.pdfFileName(report)}"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'no-store',
  });
  res.status(200).send(pdf);
});

// download excel btn - the same report as an Excel workbook
const downloadReportExcel = asyncHandler(async (req, res) => {
  const report = await service.buildReport(req.params.type, req.query, req.user);
  const workbook = await renderReportExcel(report);
  await service.recordUse(req.user, report, 'xlsx');
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${service.pdfFileName(report, 'xlsx')}"`,
    'Content-Length': workbook.length,
    'Cache-Control': 'no-store',
  });
  res.status(200).send(workbook);
});

// zip btn - one PDF for each tutor or student
const downloadPeopleZip = asyncHandler(async (req, res) => {
  const zip = await service.buildPeopleZip(req.params.type, req.query, req.user);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zip.filename}"`,
    'Content-Length': zip.buffer.length,
    'Cache-Control': 'no-store',
    'X-Report-Files': String(zip.count),
  });
  res.status(200).send(zip.buffer);
});

module.exports = { listReports, getOptions, getHistory, removeHistoryEntry, clearHistory, generateReport, downloadReportPdf, downloadReportExcel, downloadPeopleZip };
