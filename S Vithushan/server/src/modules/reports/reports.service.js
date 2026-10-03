// report list, building, PDF and history
const config = require('../../../../../shared/server/src/config/env');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const { zipSync } = require('fflate');
const parts = require('./reportParts');
const { renderReportPdfInWorker } = require('./reportPdf');

// one builder per report - each reads the database and returns the report's content
const BUILDERS = {
  overview: require('./builders/overview'),
  students: require('./builders/students'),
  tutors: require('./builders/tutors'),
  users: require('./builders/users'),
  classes: require('./builders/classes'),
  attendance: require('./builders/attendance'),
  finance: require('./builders/finance'),
  payouts: require('./builders/payouts'),
  feedback: require('./builders/feedback'),
  enquiries: require('./builders/enquiries'),
  communications: require('./builders/communications'),
  reregistration: require('./builders/reregistration'),
  audit: require('./builders/audit'),
};

// every report the admin can run - params decide which filters the form shows
const CATALOG = [
  { type: 'overview', title: 'Institute Summary', group: 'Overview', icon: 'barChart', params: ['period'], preset: 'last30',
    description: 'Key numbers for the whole institute: students, classes, fees, attendance and complaints.' },
  { type: 'students', title: 'Student Report', group: 'People', icon: 'users', params: ['period', 'studentId', 'grade', 'detail'], preset: 'last30',
    description: 'Everything about each student: classes, fees, attendance, feedback, messages and what they did on the site.' },
  { type: 'tutors', title: 'Tutor Report', group: 'People', icon: 'user', params: ['period', 'tutorId', 'detail'], preset: 'thisYear',
    description: 'Everything about each tutor: classes, students, attendance registers, messages, payouts and what they did on the site.' },
  { type: 'users', title: 'User Accounts Report', group: 'People', icon: 'lock', params: ['period', 'role', 'status'], preset: 'thisYear',
    description: 'Accounts by role and status, new registrations, locked accounts and tutor enrolment keys.' },
  { type: 'classes', title: 'Class & Timetable Report', group: 'Teaching', icon: 'book', params: ['period', 'classId'], preset: 'last30',
    description: 'Class register with enrolment, fill rate, fees and attendance, plus the weekly timetable.' },
  { type: 'attendance', title: 'Attendance Report', group: 'Teaching', icon: 'checkCircle', params: ['period', 'classId'], preset: 'last30',
    description: 'Sessions held, attendance by class and by week, and students below the attendance target.' },
  { type: 'finance', title: 'Fees & Payments Report', group: 'Finance', icon: 'wallet', params: ['period'], preset: 'last30',
    description: 'Fees collected, payment methods, slips awaiting verification, unpaid balances and every transaction.' },
  { type: 'payouts', title: 'Tutor Payouts Report', group: 'Finance', icon: 'bank', params: ['period', 'tutorId'], preset: 'thisYear',
    description: 'Payments made to tutors with bank references, amounts waiting to be sent and failed transfers.' },
  { type: 'feedback', title: 'Feedback & Complaints Report', group: 'Support', icon: 'chat', params: ['period'], preset: 'last90',
    description: 'Tickets received and resolved, open complaints by priority and how long they took to solve.' },
  { type: 'enquiries', title: 'Enquiries Report', group: 'Support', icon: 'inbox', params: ['period'], preset: 'last90',
    description: 'Messages sent from the Contact Us page, by topic, with reply times.' },
  { type: 'communications', title: 'Announcements & Notifications', group: 'Support', icon: 'megaphone', params: ['period'], preset: 'last90',
    description: 'Announcements published and notifications sent to students and tutors.' },
  { type: 'reregistration', title: 'Re-registration Report', group: 'Administration', icon: 'refresh', params: ['academicYear'], preset: null,
    description: 'Re-registration keys and which students have confirmed their place for the next year.' },
  { type: 'audit', title: 'Audit Trail Report', group: 'Administration', icon: 'shield', params: ['period', 'userId'], preset: 'last30',
    description: 'Who did what and when: sign-ins, payments, account changes and every other recorded action - for everyone or one person.' },
];

// the report types, taken from the list above
const REPORT_TYPES = CATALOG.map((entry) => entry.type);
// the filters a report request can carry
const QUERY_KEYS = ['from', 'to', 'studentId', 'tutorId', 'classId', 'userId', 'grade', 'role', 'status', 'academicYear', 'detail'];
// filters that are numbers
const NUMBER_KEYS = ['studentId', 'tutorId', 'classId', 'userId', 'academicYear'];

// reports that can be downloaded as one PDF per person
const PEOPLE_REPORTS = { tutors: { role: 'TUTOR', idKey: 'tutorId' }, students: { role: 'STUDENT_PARENT', idKey: 'studentId' } };
// a ZIP holds at most 150 people
const MAX_ZIP_PEOPLE = 150;

// reports that need an optional database update
async function isAvailable(type) {
  if (type === 'enquiries') return schema.hasTable('contact_messages');
  if (type === 'reregistration') return schema.hasReregistration();
  return true;
}

// the reports available on this install (some need a database update)
async function getCatalog() {
  const list = [];
  for (const entry of CATALOG) {
    if (await isAvailable(entry.type)) list.push(entry);
  }
  return list;
}

// dropdown choices for the report form
async function getOptions() {
  const tutors = await parts.rows(
    `SELECT id, full_name, status FROM users WHERE role = 'TUTOR' AND status <> 'DELETED' ORDER BY full_name`
  );
  const students = await parts.rows(
    `SELECT id, full_name, student_code, grade, status FROM users
     WHERE role = 'STUDENT_PARENT' AND status <> 'DELETED' ORDER BY full_name`
  );
  const classes = await parts.rows(
    `SELECT c.id, c.subject, c.status, u.full_name AS tutor_name
     FROM classes c JOIN users u ON u.id = c.tutor_id ORDER BY c.status, c.subject`
  );
  const people = await parts.rows(
    `SELECT id, full_name, role FROM users WHERE status <> 'DELETED' ORDER BY FIELD(role, 'ADMIN', 'TUTOR', 'STUDENT_PARENT'), full_name`
  );
  const year = new Date().getFullYear();
  return {
    people: people.map((item) => ({ id: item.id, name: item.full_name, role: item.role })),
    tutors: tutors.map((item) => ({ id: item.id, name: item.full_name, status: item.status })),
    students: students.map((item) => ({ id: item.id, name: item.full_name, code: item.student_code, grade: item.grade, status: item.status })),
    classes: classes.map((item) => ({ id: item.id, subject: item.subject, status: item.status, tutorName: item.tutor_name })),
    grades: GRADES,
    years: [year - 1, year, year + 1],
    defaultYear: year + 1,
  };
}

// only the filters this report uses, so history can re-run it exactly
function cleanQuery(entry, query) {
  const clean = {};
  QUERY_KEYS.forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null || value === '') return;
    if ((key === 'from' || key === 'to') && !entry.params.includes('period')) return;
    if (key !== 'from' && key !== 'to' && !entry.params.includes(key)) return;
    clean[key] = NUMBER_KEYS.includes(key) ? Number(value) : String(value);
  });
  return clean;
}

// build one report - clean the filters, pick the period, run the builder, add who made it and its number
async function buildReport(type, query, adminUser) {
  // find the report in the list
  const entry = CATALOG.find((item) => item.type === type);
  if (!entry || !(await isAvailable(type))) {
    throw ApiError.notFound('That report is not available.');
  }
  // keep only the filters this report uses
  const params = cleanQuery(entry, query);
  // the date range of the report
  const period = parts.resolvePeriod(params.from, params.to);
  const builder = BUILDERS[type];
  // the builder returns the title, summary, highlights and sections
  const result = await builder.build(params, {
    period,
    threshold: config.business.lowAttendanceThresholdPercent,
  });

  // who generated it, and when
  const admin = await parts.one('SELECT full_name FROM users WHERE id = ?', [adminUser.id]);
  const generatedAt = parts.nowText();
  return {
    type,
    title: result.title,
    subtitle: result.subtitle || '',
    orientation: result.orientation || 'portrait',
    reportNumber: parts.reportNumber(builder.code),
    generatedAt,
    generatedText: parts.formatDateTime(generatedAt),
    generatedBy: admin.full_name || adminUser.email,
    periodLabel: result.periodLabel || period.label,
    parameters: result.filters || [],
    summary: result.summary || [],
    highlights: result.highlights || [],
    sections: result.sections || [],
    query: { ...params, from: entry.params.includes('period') ? period.from : undefined, to: entry.params.includes('period') ? period.to : undefined },
  };
}

// history entry in the audit log
async function recordUse(adminUser, report, format) {
  await recordAuditEvent({
    actorId: adminUser.id,
    action: format === 'view' ? 'REPORT_GENERATED' : 'REPORT_DOWNLOADED',
    entityType: 'report',
    entityId: null,
    details: {
      type: report.type,
      title: report.title,
      reportNumber: report.reportNumber,
      periodLabel: report.periodLabel,
      filters: report.parameters,
      query: report.query,
      format,
    },
  });
}

// the 40 most recent report runs and downloads, from the audit log
async function getHistory() {
  const list = await parts.rows(
    `SELECT a.id, a.action, a.details, a.created_at, u.full_name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.action IN ('REPORT_GENERATED', 'REPORT_DOWNLOADED')
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 40`
  );
  return list.map((item) => {
    let details = item.details || {};
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        details = {};
      }
    }
    return {
      id: item.id,
      format: ['zip', 'xlsx'].includes(details.format) ? details.format : item.action === 'REPORT_DOWNLOADED' ? 'pdf' : 'view',
      type: details.type,
      title: details.title,
      reportNumber: details.reportNumber,
      periodLabel: details.periodLabel,
      filters: Array.isArray(details.filters) ? details.filters : [],
      query: details.query || {},
      generatedBy: item.actor_name || 'Unknown',
      createdAt: item.created_at,
    };
  });
}

// Tutor-Report-RPT-TUT-20261002-1530-4F2A.pdf
function pdfFileName(report, extension = 'pdf') {
  const title = report.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${title}-${report.reportNumber}.${extension}`;
}

// zip btn - one PDF per tutor or student, all in one ZIP file
async function buildPeopleZip(type, query, adminUser) {
  const people = PEOPLE_REPORTS[type];
  if (!people) {
    throw ApiError.badRequest('Separate files are only made for the tutor and student reports.');
  }
  // find the report in the list
  const entry = CATALOG.find((item) => item.type === type);
  const params = cleanQuery(entry, query);
  // the student ZIP can be limited to one grade
  const filter = params.grade && type === 'students' ? 'AND grade = ?' : '';
  const list = await parts.rows(
    `SELECT id, full_name, student_code FROM users WHERE role = ? AND status <> 'DELETED' ${filter} ORDER BY full_name`,
    filter ? [people.role, params.grade] : [people.role]
  );
  if (list.length === 0) {
    throw ApiError.badRequest(`There are no ${type} to report on with these filters.`);
  }
  if (list.length > MAX_ZIP_PEOPLE) {
    throw ApiError.badRequest(`${list.length} ${type} is too many for one download. Choose a grade to split it.`, [
      { field: 'grade', message: `Choose a grade - downloads are limited to ${MAX_ZIP_PEOPLE} people at a time.` },
    ]);
  }

  // build one PDF per person
  const files = {};
  let first = null;
  for (const person of list) {
    const report = await buildReport(type, { ...params, detail: undefined, grade: undefined, [people.idKey]: person.id }, adminUser);
    if (!first) first = report;
    const pdf = await renderReportPdfInWorker(report);
    const name = `${person.full_name}${person.student_code ? `-${person.student_code}` : ''}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    files[`${name || 'person'}-${person.id}.pdf`] = new Uint8Array(pdf);
  }
  // put all the PDFs into one ZIP (stored as they are - PDFs are already compressed)
  const zip = zipSync(files, { level: 0 });

  // name the ZIP and log the download in the history
  const label = type === 'tutors' ? 'Tutor' : 'Student';
  const stamp = parts.toDateKey(new Date());
  await recordUse(
    adminUser,
    {
      type,
      title: `${label} Reports - one PDF each`,
      reportNumber: parts.reportNumber(type === 'tutors' ? 'TUT' : 'STU'),
      periodLabel: first.periodLabel,
      parameters: [
        { label: 'Files', value: `${list.length} PDF${list.length === 1 ? '' : 's'}` },
        ...(params.grade ? [{ label: 'Students', value: params.grade }] : []),
      ],
      query: { ...first.query, [people.idKey]: undefined, grade: params.grade },
    },
    'zip'
  );

  return { buffer: Buffer.from(zip), filename: `${label}-Reports-${stamp}.zip`, count: list.length };
}

module.exports = { REPORT_TYPES, getCatalog, getOptions, buildReport, recordUse, getHistory, pdfFileName, buildPeopleZip };
