// report building blocks - formatting, periods, tables, charts
const crypto = require('crypto');
const { pool } = require('../../../../../shared/server/src/config/db');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_ROWS = 2000;

// enum value -> colour of its badge
const TONES = {
  SUCCESSFUL: 'success', PAID: 'success', SENT: 'success', RESOLVED: 'success', ACTIVE: 'success',
  USED: 'success', HANDLED: 'success', PUBLISHED: 'success', PRESENT: 'success', EXTRA: 'success',
  PENDING: 'warning', QUEUED: 'warning', IN_PROGRESS: 'warning', UNUSED: 'warning', NEW: 'warning',
  SCHEDULED: 'warning', LATE: 'warning', UNPAID: 'warning', MEDIUM: 'warning', EXPIRED: 'warning',
  FAILED: 'danger', SUSPENDED: 'danger', REVOKED: 'danger', CANCELLED: 'danger', ABSENT: 'danger', HIGH: 'danger',
  SAME_DAY: 'success', MARKED_LATER: 'warning', CHECKINS_ONLY: 'warning', NOT_MARKED: 'danger',
};

// enum value -> friendly words
const LABELS = {
  STUDENT_PARENT: 'Student', TUTOR: 'Tutor', ADMIN: 'Admin',
  CARD: 'Card', EZ_CASH: 'eZ Cash', MCASH: 'mCash', BANK_TRANSFER: 'Bank transfer', BANK_DEPOSIT: 'Bank deposit slip',
  CASH: 'Cash', ONLINE: 'Online (PayHere)', BANK_FILE: 'Bank file', PAYOUT_API: 'Payout provider', MANUAL: 'Manual record',
  IN_PROGRESS: 'In progress', ADMIN_TUTOR: 'Admin & tutor', ALL: 'Everyone', EZCASH: 'eZ Cash',
  IN_APP: 'In-app', EMAIL: 'Email', SMS: 'SMS', EXTRA: 'Extra class',
  SAME_DAY: 'Marked same day', MARKED_LATER: 'Marked later', CHECKINS_ONLY: 'Check-ins only',
  NOT_MARKED: 'Not marked', NOT_YET: 'Not marked yet', HOLIDAY: 'Public holiday', NO_STUDENTS: 'No students yet',
};

const num = (value) => Number(value) || 0;

// share as a 0-100 number with one decimal, or null when there is nothing to divide
function percent(part, whole) {
  if (!whole) return null;
  return Math.round((num(part) / num(whole)) * 1000) / 10;
}

// change from previous to current, in percent
function change(current, previous) {
  if (!previous) return null;
  return Math.round(((num(current) - num(previous)) / num(previous)) * 1000) / 10;
}

function label(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (LABELS[value]) return LABELS[value];
  const text = String(value);
  if (!/^[A-Z0-9_]+$/.test(text)) return text;
  const words = text.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// --- dates ---

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function daysBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}

// 02 Oct 2026
function formatDate(value) {
  if (!value) return '-';
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// 02 Oct 2026 15:30
function formatDateTime(value) {
  if (!value) return '-';
  const text = String(value);
  const time = text.length >= 16 ? text.slice(11, 16) : '';
  return time ? `${formatDate(text)} ${time}` : formatDate(text);
}

// 3:30 PM
function formatTime(value) {
  if (!value) return '';
  const [hours, minutes] = String(value).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${((hours + 11) % 12) + 1}:${pad(minutes)} ${suffix}`;
}

// Sunday 8:00 AM - 11:00 AM (short: Sun 8:00 AM - 11:00 AM)
function formatSchedule(day, start, end, short = false) {
  if (!day) return '-';
  const dayText = short ? day.slice(0, 3) : day;
  if (!start) return dayText;
  return `${dayText} ${formatTime(start)} - ${formatTime(end)}`;
}

function monthLabel(key) {
  const [year, month] = String(key).split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function nowText() {
  const now = new Date();
  return `${toDateKey(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// report period - from/to are inclusive YYYY-MM-DD dates
function resolvePeriod(from, to) {
  const today = toDateKey(new Date());
  const end = to || today;
  const start = from || `${end.slice(0, 7)}-01`;
  const days = daysBetween(start, end) + 1;
  const previousTo = addDays(start, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return {
    from: start,
    to: end,
    days,
    start: `${start} 00:00:00`,
    end: `${addDays(end, 1)} 00:00:00`,
    label: `${formatDate(start)} - ${formatDate(end)}`,
    previous: {
      from: previousFrom,
      to: previousTo,
      start: `${previousFrom} 00:00:00`,
      end: `${start} 00:00:00`,
      label: `${formatDate(previousFrom)} - ${formatDate(previousTo)}`,
    },
  };
}

// every month key between two dates, e.g. 2026-04 ... 2026-09
function monthKeys(fromKey, toKey) {
  const keys = [];
  const cursor = parseDateKey(`${fromKey.slice(0, 7)}-01`);
  const last = parseDateKey(`${toKey.slice(0, 7)}-01`);
  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

// --- formatting ---

function money(value) {
  return num(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatValue(value, format) {
  if (format === 'text' || !format) return value === null || value === undefined || value === '' ? '-' : String(value);
  if (value === null || value === undefined || value === '') return '-';
  if (format === 'money') return money(value);
  if (format === 'lkr') return `LKR ${money(value)}`;
  if (format === 'lkr0') return `LKR ${Math.round(num(value)).toLocaleString('en-US')}`;
  if (format === 'number') return num(value).toLocaleString('en-US');
  if (format === 'percent') return `${num(value).toFixed(1)}%`;
  if (format === 'date') return formatDate(value);
  if (format === 'datetime') return formatDateTime(value);
  if (format === 'status' || format === 'label') return label(value);
  if (format === 'hours') return formatHours(value);
  return String(value);
}

// 5.5 hours -> "5.5 h", 50 hours -> "2.1 days"
function formatHours(hours) {
  const value = num(hours);
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}

function isNumeric(format) {
  return ['money', 'lkr', 'lkr0', 'number', 'percent', 'hours'].includes(format);
}

// --- report blocks ---

// KPI tile
function kpi(title, value, format = 'number', extra = {}) {
  return { label: title, value: formatValue(value, format), raw: value, format, tone: extra.tone || 'default', note: extra.note || '' };
}

// table - columns: { key, label, format, width }, rows: plain objects
function table(columns, rows, options = {}) {
  const cols = columns.map((column) => {
    const width = column.width || (isNumeric(column.format) ? 'auto' : '*');
    return {
      label: column.format === 'money' ? `${column.label} (LKR)` : column.label,
      align: column.align || (isNumeric(column.format) ? 'right' : 'left'),
      width,
      // short values (codes, dates, phones, amounts) stay on one line
      nowrap: width === 'auto',
      format: column.format || 'text',
    };
  });
  // raw numbers and dates are kept for the Excel download
  const keepRaw = (format) => isNumeric(format) || format === 'date' || format === 'datetime';
  const limited = rows.slice(0, MAX_ROWS);
  const body = limited.map((row) =>
    columns.map((column) => {
      const raw = row[column.key];
      const cell = { text: formatValue(raw, column.format) };
      if (column.format === 'status' && TONES[raw]) cell.tone = TONES[raw];
      if (keepRaw(column.format) && raw !== null && raw !== undefined && raw !== '') cell.value = raw;
      return cell;
    })
  );
  let totals = null;
  if (options.totals && limited.length > 0) {
    totals = columns.map((column, index) => {
      if (index === 0) return { text: options.totalsLabel || 'Total' };
      if (!options.totals.includes(column.key)) return { text: '' };
      const sum = rows.reduce((total, row) => total + num(row[column.key]), 0);
      return { text: formatValue(sum, column.format), value: sum };
    });
  }
  let note = options.note || '';
  if (rows.length > MAX_ROWS) {
    note = `Showing the first ${MAX_ROWS.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} rows.`;
  }
  return {
    type: 'table',
    title: options.title || '',
    columns: cols,
    rows: body,
    totals,
    note,
    emptyText: options.emptyText || 'Nothing to show for this period.',
  };
}

// horizontal bar chart
function bars(title, items, format = 'number', options = {}) {
  return {
    type: 'bars',
    title,
    format,
    max: options.max || Math.max(0, ...items.map((item) => num(item.value))),
    items: items.map((item) => ({ label: String(item.label), value: num(item.value), display: formatValue(item.value, format) })),
    emptyText: options.emptyText || 'No data for this period.',
  };
}

// vertical column chart (time series)
function columnChart(title, items, format = 'number') {
  return {
    type: 'columns',
    title,
    format,
    max: Math.max(0, ...items.map((item) => num(item.value))),
    items: items.map((item) => ({ label: String(item.label), value: num(item.value), display: formatValue(item.value, format) })),
  };
}

// label / value pairs
function facts(items, title = '') {
  return {
    type: 'facts',
    title,
    items: items.filter(Boolean).map((item) => ({ label: item.label, value: formatValue(item.value, item.format || 'text') })),
  };
}

// KPI tiles inside a section
function tiles(items) {
  return { type: 'kpis', items };
}

function note(text) {
  return { type: 'note', text };
}

// sub-heading inside a section (e.g. "Payments" inside one student's pages)
function heading(text) {
  return { type: 'heading', text };
}

function signatures(roles = ['Prepared by', 'Checked by', 'Approved by']) {
  return { type: 'signatures', items: roles };
}

function section(title, blocks, options = {}) {
  return { title, intro: options.intro || '', pageBreak: Boolean(options.pageBreak), blocks: blocks.filter(Boolean) };
}

// RPT-TUT-20261002-1530-4F2A
function reportNumber(code) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `RPT-${code}-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// masks a bank account: ••••1234
function maskAccount(bankName, accountNumber, last4) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  const tail = last4 || (digits.length >= 4 ? digits.slice(-4) : '');
  if (!bankName && !tail) return '-';
  return `${bankName || 'Account'}${tail ? ` ••••${tail}` : ''}`;
}

// runs a query and returns the rows
async function rows(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function one(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result[0] || {};
}

module.exports = {
  MAX_ROWS,
  num,
  percent,
  change,
  label,
  toDateKey,
  addDays,
  daysBetween,
  formatDate,
  formatDateTime,
  formatTime,
  formatSchedule,
  formatValue,
  formatHours,
  monthLabel,
  monthKeys,
  money,
  nowText,
  resolvePeriod,
  kpi,
  table,
  bars,
  columnChart,
  facts,
  tiles,
  note,
  heading,
  signatures,
  section,
  reportNumber,
  maskAccount,
  rows,
  one,
};
