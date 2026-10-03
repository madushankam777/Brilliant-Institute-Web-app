// Class & timetable report - every class, or one class in detail
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../../shared/server/src/utils/schemaFeatures');
const parts = require('../reportParts');
const data = require('../reportData');

const { num, percent, kpi, table, bars, facts, section, rows, money } = parts;

// weekday order, Monday first
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// the columns of the class register table
const REGISTER_COLUMNS = [
  { key: 'subject', label: 'Class' },
  { key: 'tutor', label: 'Tutor' },
  { key: 'schedule', label: 'Schedule', width: 128 },
  { key: 'venue', label: 'Venue', width: 52 },
  { key: 'seats', label: 'Enrolled', align: 'right', width: 'auto' },
  { key: 'fill', label: 'Filled', format: 'percent' },
  { key: 'fee', label: 'Fee', format: 'money' },
  { key: 'collected', label: 'Collected', format: 'money' },
  { key: 'owed', label: 'Outstanding', format: 'money' },
  { key: 'attendance', label: 'Attendance', format: 'percent' },
];

// class report - one class in detail, or every class
async function build(params, context) {
  // the class (or all classes) with its tutor and enrolment
  const classes = await data.getClasses({ classId: params.classId });
  if (params.classId && classes.length === 0) throw ApiError.notFound('Class not found.');
  // fees collected, unpaid balances, attendance and schedule changes per class
  const collections = await data.getCollectionsByClass(context.period);
  const outstanding = await data.getOutstandingByClass();
  const attendance = await data.getAttendanceByClass(context.period);
  const changes = await getChanges(context.period, params.classId);
  const lookups = { collections, outstanding, attendance, changes };
  if (params.classId) return buildOne(classes[0], lookups, context);
  return buildAll(classes, lookups, context);
}

// cancelled days and extra classes in the period
async function getChanges(period, classId) {
  if (!(await schema.hasClassEvents())) return null;
  return rows(
    `SELECT ce.event_date, ce.type, ce.start_time, ce.end_time, ce.venue, ce.note, c.subject
     FROM class_events ce JOIN classes c ON c.id = ce.class_id
     WHERE ce.event_date BETWEEN ? AND ? ${classId ? 'AND ce.class_id = ?' : ''}
     ORDER BY ce.event_date ASC`,
    classId ? [period.from, period.to, classId] : [period.from, period.to]
  );
}

// the table of cancelled days and extra classes (nothing when that update is missing)
function changesTable(changes) {
  if (!changes) return null;
  return table(
    [
      { key: 'event_date', label: 'Date', format: 'date', width: 'auto' },
      { key: 'subject', label: 'Class' },
      { key: 'type', label: 'Change', format: 'status', width: 'auto' },
      { key: 'time', label: 'Time', width: 'auto' },
      { key: 'venue', label: 'Venue', width: 'auto' },
      { key: 'note', label: 'Note' },
    ],
    changes.map((item) => ({
      ...item,
      time: item.start_time ? `${parts.formatTime(item.start_time)} - ${parts.formatTime(item.end_time)}` : '-',
    })),
    { title: 'Schedule changes in this period', emptyText: 'No classes were cancelled or added in this period.' }
  );
}

// --- all classes ---
// the report for every class - register, timetable, subject areas and cancelled classes
function buildAll(classes, { collections, outstanding, attendance, changes }) {
  // classes that are running
  const active = classes.filter((item) => item.status === 'ACTIVE');
  // classes that were cancelled
  const cancelled = classes.filter((item) => item.status !== 'ACTIVE');
  // one class as a register row
  const toRow = (item) => ({
    subject: item.subject,
    tutor: item.tutor_name,
    schedule: parts.formatSchedule(item.day_of_week, item.start_time, item.end_time, true),
    venue: item.venue,
    seats: `${item.enrolled} / ${item.capacity}`,
    fill: percent(item.enrolled, item.capacity),
    fee: item.fee,
    collected: collections.get(item.id)?.collected || 0,
    owed: outstanding.get(item.id)?.owed || 0,
    attendance: attendance.get(item.id)?.rate ?? null,
  });
  const register = active.map(toRow);
  const cancelledRows = cancelled.map(toRow);
  // total seats in the active classes
  const seats = active.reduce((sum, item) => sum + item.capacity, 0);
  // students enrolled
  const enrolled = active.reduce((sum, item) => sum + item.enrolled, 0);
  // fees collected over all classes
  const collected = [...register, ...cancelledRows].reduce((sum, item) => sum + item.collected, 0);
  // fees still unpaid
  const owed = [...register, ...cancelledRows].reduce((sum, item) => sum + item.owed, 0);
  const fill = percent(enrolled, seats);

  // the weekly timetable - by day, then start time
  const timetable = [...active].sort(
    (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week) || String(a.start_time).localeCompare(String(b.start_time))
  );

  // subject areas
  const areas = new Map();
  active.forEach((item) => {
    const key = item.subject_area || 'Other';
    const entry = areas.get(key) || { area: key, classes: 0, enrolled: 0, collected: 0 };
    entry.classes += 1;
    entry.enrolled += item.enrolled;
    entry.collected += collections.get(item.id)?.collected || 0;
    areas.set(key, entry);
  });

  // the key findings
  const highlights = [`${active.length} active classes have ${enrolled} enrolments for ${seats} seats (${fill ?? 0}% full).`];
  // classes with no seats left
  const full = active.filter((item) => item.enrolled >= item.capacity);
  if (full.length > 0) highlights.push(`${full.length} class(es) are full: ${full.map((item) => item.subject).join(', ')}.`);
  // classes with no students yet
  const empty = active.filter((item) => item.enrolled === 0);
  if (empty.length > 0) highlights.push(`${empty.length} class(es) have no students yet: ${empty.map((item) => item.subject).join(', ')}.`);
  highlights.push(`Classes collected LKR ${money(collected)} in the period; LKR ${money(owed)} is still unpaid.`);
  if (changes && changes.length > 0) {
    const cancelled = changes.filter((item) => item.type === 'CANCELLED').length;
    highlights.push(`${cancelled} class day(s) were cancelled and ${changes.length - cancelled} extra class(es) were added.`);
  }

  // the report - title, filters, key figures, key findings and sections
  return {
    title: 'Class & Timetable Report',
    subtitle: 'Enrolment, fees, attendance and the weekly timetable for every class',
    orientation: 'landscape',
    filters: [{ label: 'Classes', value: 'All classes' }],
    summary: [
      kpi('Active classes', active.length),
      kpi('Seats', seats),
      kpi('Enrolled', enrolled),
      kpi('Seats filled', fill, 'percent', { tone: fill !== null && fill < 50 ? 'warning' : 'success' }),
      kpi('Fees collected', collected, 'lkr0', { tone: 'success' }),
      kpi('Outstanding', owed, 'lkr0', { tone: owed > 0 ? 'warning' : 'success' }),
    ],
    highlights,
    sections: [
      section('Class register', [
        table(
          REGISTER_COLUMNS,
          register,
          { totals: ['collected', 'owed'], emptyText: 'There are no active classes.' }
        ),
        cancelledRows.length > 0
          ? table(REGISTER_COLUMNS, cancelledRows, { title: 'Cancelled classes', totals: ['collected', 'owed'] })
          : null,
        bars('Seats filled in each active class', active.map((item) => ({ label: item.subject, value: percent(item.enrolled, item.capacity) || 0 })), 'percent', { max: 100 }),
      ], { intro: 'Collected = fees paid during the period. Outstanding = unpaid balance today. Attendance = present or late, out of all marks in the period.' }),
      section('Weekly timetable', [
        table(
          [
            { key: 'day_of_week', label: 'Day', width: 'auto' },
            { key: 'time', label: 'Time', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'level', label: 'Level', width: 'auto' },
            { key: 'tutor_name', label: 'Tutor' },
            { key: 'venue', label: 'Venue', width: 'auto' },
            { key: 'seats', label: 'Enrolled', align: 'right', width: 'auto' },
          ],
          timetable.map((item) => ({
            ...item,
            time: item.start_time ? `${parts.formatTime(item.start_time)} - ${parts.formatTime(item.end_time)}` : '-',
            seats: `${item.enrolled} / ${item.capacity}`,
          })),
          { emptyText: 'There are no active classes.' }
        ),
        changesTable(changes),
      ]),
      section('Subject areas', [
        table(
          [
            { key: 'area', label: 'Subject area' },
            { key: 'classes', label: 'Classes', format: 'number' },
            { key: 'enrolled', label: 'Enrolled', format: 'number' },
            { key: 'collected', label: 'Fees collected', format: 'money' },
          ],
          [...areas.values()].sort((a, b) => b.collected - a.collected),
          { totals: ['classes', 'enrolled', 'collected'] }
        ),
      ]),
    ],
  };
}

// --- one class ---
// the report for one class - details, students, attendance, sessions and payments
async function buildOne(cls, { collections, outstanding, attendance, changes }, { period, threshold }) {
  // every student enrolled in this class, with their balance
  const students = await rows(
    `SELECT u.id, u.student_code, u.full_name, u.grade, u.phone, e.enrolled_at, e.status, e.payment_status, e.balance
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.class_id = ?
     ORDER BY e.status, u.full_name`,
    [cls.id]
  );
  // each student's attendance in the period
  const studentAttendance = await rows(
    `SELECT ar.student_id, COUNT(*) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id
     WHERE cs.class_id = ? AND cs.session_date BETWEEN ? AND ?
     GROUP BY ar.student_id`,
    [cls.id, period.from, period.to]
  );
  // the sessions held in the period
  const sessions = await rows(
    `SELECT cs.session_date, COUNT(ar.id) AS marks, SUM(ar.status = 'PRESENT') AS present,
            SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent
     FROM class_sessions cs LEFT JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.class_id = ? AND cs.session_date BETWEEN ? AND ?
     GROUP BY cs.id, cs.session_date
     ORDER BY cs.session_date ASC`,
    [cls.id, period.from, period.to]
  );
  // payments for this class in the period
  const payments = await rows(
    `SELECT COALESCE(p.paid_at, p.created_at) AS date, r.receipt_number, u.full_name, p.payment_method, p.status, p.amount
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN users u ON u.id = p.student_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE e.class_id = ? AND COALESCE(p.paid_at, p.created_at) >= ? AND COALESCE(p.paid_at, p.created_at) < ?
     ORDER BY date ASC`,
    [cls.id, period.start, period.end]
  );
  const attendanceMap = data.byId(studentAttendance, 'student_id');
  const att = attendance.get(cls.id) || { sessions: 0, marks: 0, rate: null };
  const collected = collections.get(cls.id)?.collected || 0;
  const owed = outstanding.get(cls.id)?.owed || 0;
  const fill = percent(cls.enrolled, cls.capacity);

  // the students with their attendance rate
  const roster = students.map((item) => {
    const own = attendanceMap.get(item.id);
    return { ...item, attendance: own ? percent(own.attended, own.marks) : null };
  });
  // active students under the attendance target
  const low = roster.filter((item) => item.status === 'ACTIVE' && item.attendance !== null && item.attendance < threshold);

  // the key findings
  const highlights = [
    `${cls.enrolled} of ${cls.capacity} seats are taken (${fill ?? 0}% full).`,
    `${att.sessions} session(s) held in the period with ${att.rate ?? 0}% attendance.`,
    `LKR ${money(collected)} collected in the period; LKR ${money(owed)} is still unpaid.`,
  ];
  if (low.length > 0) highlights.push(`${low.length} student(s) are below the ${threshold}% attendance target.`);

  // the report - title, filters, key figures, key findings and sections
  return {
    title: 'Class Report',
    subtitle: `${cls.subject} - ${cls.tutor_name}`,
    orientation: 'portrait',
    filters: [{ label: 'Class', value: cls.subject }],
    summary: [
      kpi('Enrolled', `${cls.enrolled} / ${cls.capacity}`, 'text'),
      kpi('Seats filled', fill, 'percent'),
      kpi('Sessions held', att.sessions),
      kpi('Attendance', att.rate, 'percent', { tone: att.rate !== null && att.rate < threshold ? 'warning' : 'success' }),
      kpi('Fees collected', collected, 'lkr0', { tone: 'success' }),
      kpi('Outstanding', owed, 'lkr0', { tone: owed > 0 ? 'warning' : 'success' }),
    ],
    highlights,
    sections: [
      section('Class details', [
        facts([
          { label: 'Class', value: cls.subject },
          { label: 'Subject area', value: cls.subject_area },
          { label: 'Level', value: cls.level },
          { label: 'Tutor', value: cls.tutor_name },
          { label: 'Schedule', value: parts.formatSchedule(cls.day_of_week, cls.start_time, cls.end_time) },
          { label: 'Venue', value: cls.venue },
          { label: 'Monthly fee', value: cls.fee, format: 'lkr' },
          { label: 'Status', value: cls.status, format: 'status' },
          cls.start_date ? { label: 'Starts', value: cls.start_date, format: 'date' } : null,
          { label: 'Created', value: cls.created_at, format: 'date' },
        ]),
      ]),
      section('Students', [
        table(
          [
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'grade', label: 'Grade', width: 'auto' },
            { key: 'enrolled_at', label: 'Enrolled', format: 'date', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'balance', label: 'Balance', format: 'money' },
            { key: 'attendance', label: 'Attendance', format: 'percent' },
          ],
          roster,
          { totals: ['balance'], emptyText: 'No students have enrolled yet.' }
        ),
      ]),
      section('Sessions in this period', [
        table(
          [
            { key: 'session_date', label: 'Date', format: 'date', width: 'auto' },
            { key: 'present', label: 'Present', format: 'number' },
            { key: 'late', label: 'Late', format: 'number' },
            { key: 'absent', label: 'Absent', format: 'number' },
            { key: 'rate', label: 'Attendance', format: 'percent' },
          ],
          sessions.map((item) => ({ ...item, rate: percent(num(item.present) + num(item.late), item.marks) })),
          { totals: ['present', 'late', 'absent'], emptyText: 'No sessions were held in this period.' }
        ),
        changesTable(changes),
      ]),
      section('Payments in this period', [
        table(
          [
            { key: 'date', label: 'Date', format: 'date', width: 'auto' },
            { key: 'receipt_number', label: 'Receipt', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'payment_method', label: 'Method', format: 'label', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          payments,
          { emptyText: 'No payments for this class in this period.' }
        ),
      ]),
    ],
  };
}

module.exports = { code: 'CLS', build };
