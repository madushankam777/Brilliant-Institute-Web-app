// report API calls - list, build and download reports, and the analytics data
import httpClient from '../../../shared/client/src/api/httpClient';

// reports page - which reports exist
export async function fetchReportCatalog() {
  const response = await httpClient.get('/admin/reports');
  return response.data.data.reports;
}

// tutors, students, classes and years for the report form
export async function fetchReportOptions() {
  const response = await httpClient.get('/admin/reports/options');
  return response.data.data.options;
}

// recent reports
export async function fetchReportHistory() {
  const response = await httpClient.get('/admin/reports/history');
  return response.data.data.history;
}

// delete btn - removes one recent report from the list
export async function deleteReportHistory(id) {
  const response = await httpClient.delete(`/admin/reports/history/${id}`);
  return response.data.message;
}

// delete all btn - clears the recent reports list
export async function clearReportHistory() {
  const response = await httpClient.post('/admin/reports/history/clear');
  return response.data.message;
}

// generate btn - the report shown on screen
export async function generateReport(type, params) {
  const response = await httpClient.get(`/admin/reports/${type}`, { params, timeout: 60000 });
  return response.data.data.report;
}

// saves a downloaded file under the name the server gave it
function saveFile(response, fallbackName) {
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// download pdf btn - saves the PDF file
export async function downloadReportPdf(type, params) {
  const response = await httpClient.get(`/admin/reports/${type}/pdf`, {
    params,
    responseType: 'blob',
    timeout: 180000,
  });
  return saveFile(response, `${type}-report.pdf`);
}

// download excel btn - saves the report as an Excel workbook
export async function downloadReportExcel(type, params) {
  const response = await httpClient.get(`/admin/reports/${type}/xlsx`, {
    params,
    responseType: 'blob',
    timeout: 180000,
  });
  return saveFile(response, `${type}-report.xlsx`);
}

// analytics page - chart data for a period
export async function fetchAnalytics(params) {
  const response = await httpClient.get('/admin/analytics', { params, timeout: 60000 });
  return response.data.data.analytics;
}

// one pdf per person btn - saves a ZIP with a PDF for each tutor or student
export async function downloadReportZip(type, params) {
  const response = await httpClient.get(`/admin/reports/${type}/zip`, {
    params,
    responseType: 'blob',
    timeout: 600000,
  });
  const filename = saveFile(response, `${type}-reports.zip`);
  return { filename, count: Number(response.headers['x-report-files'] || 0) };
}
