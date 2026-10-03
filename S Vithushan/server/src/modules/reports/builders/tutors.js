// Tutor report - each tutor's classes, students, registers, messages, payouts and site activity
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../../shared/server/src/utils/schemaFeatures');
const holidayCalendar = require('../../../../../../C D Kumanan/server/src/modules/course/holidayCalendar');
const parts = require('../reportParts');
const data = require('../reportData');
const { getActivity, getStaffActions, activityBlocks } = require('../reportActivity');

const { num, percent, kpi, table, bars, facts, tiles, heading, section, note, rows, one, money } = parts;

// weekday names in JavaScript's order (Sunday first)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// weekday name of a YYYY-MM-DD date
function weekdayOf(dateKey) {
  return WEEKDAYS[new Date(`${dateKey}T00:00:00`).getDay()];
}

// public holidays in the period (none if the calendar cannot be reached)
async function loadHolidays(period) {
  try {
    const list = await holidayCalendar.getHolidays(period.from, period.to);
    return new Map(list.map((item) => [item.date, item.name]));
  } catch {
    return new Map();
  }
}

// tutor report - one tutor in full, or every tutor with an overview and a full report for each
async function build(params, context) {
  const { period } = context;
  const tutorFilter = params.tutorId ? 'AND id = ?' : '';
  // the tutors to report on
  const tutors = await rows(
    `SELECT id, full_name, email, phone, status, bio, bank_name, bank_account_number, bank_branch, created_at, last_login_at
     FROM users
     WHERE role = 'TUTOR' AND status <> 'DELETED' ${tutorFilter}
     ORDER BY full_name`,
    params.tutorId ? [params.tutorId] : []
  );
  if (params.tutorId && tutors.length === 0) throw ApiError.notFound('Tutor not found.');

  // looked up once for every tutor
  const paidOnly = (await schema.hasPayoutTracking()) ? "WHERE status IN ('SENT', 'RECORDED')" : '';
  const hasEvents = await schema.hasClassEvents();
  const shared = {
    classes: await data.getClasses({ tutorId: params.tutorId }),
    collections: await data.getCollectionsByClass(period),
    outstanding: await data.getOutstandingByClass(),
    attendance: await data.getAttendanceByClass(period),
    payouts: await data.getPayouts(period, params.tutorId),
    unsettled: await data.getUnsettledPayouts(params.tutorId),
    lifetime: data.byId(
      await rows(`SELECT tutor_id, SUM(amount) AS total, MAX(paid_at) AS last_paid FROM tutor_payouts ${paidOnly} GROUP BY tutor_id`),
      'tutor_id'
    ),
    students: data.byId(
      await rows(
        `SELECT c.tutor_id, COUNT(DISTINCT e.student_id) AS students
         FROM enrollments e JOIN classes c ON c.id = e.class_id
         WHERE e.status = 'ACTIVE' AND c.status = 'ACTIVE'
         GROUP BY c.tutor_id`
      ),
      'tutor_id'
    ),
    feedback: data.byId(
      await rows(
        `SELECT recipient_tutor_id, COUNT(*) AS total, SUM(status <> 'RESOLVED') AS open_now
         FROM feedback_complaints WHERE recipient_tutor_id IS NOT NULL GROUP BY recipient_tutor_id`
      ),
      'recipient_tutor_id'
    ),
    holidays: await loadHolidays(period),
    events: hasEvents
      ? await rows('SELECT class_id, event_date, type, note FROM class_events WHERE event_date BETWEEN ? AND ?', [period.from, period.to])
      : [],
    hasEvents,
  };

  // one detailed result per tutor
  const details = [];
  for (const tutor of tutors) {
    details.push(await tutorDetail(tutor, context, shared));
  }

  // one tutor - each part is its own numbered section
  if (params.tutorId) {
    const item = details[0];
    return {
      title: 'Tutor Report',
      subtitle: `${item.name} - classes, students, teaching, messages, payouts and site activity`,
      orientation: 'landscape',
      filters: [{ label: 'Tutor', value: item.name }],
      summary: item.kpis,
      highlights: item.highlights,
      sections: item.groups.map((group) => section(group.title, group.blocks, { intro: group.intro })),
    };
  }

  // totals over all tutors
  const totals = details.reduce(
    (sum, item) => ({
      classes: sum.classes + item.classes,
      collected: sum.collected + item.collected,
      paid: sum.paid + item.paid,
      waiting: sum.waiting + item.waiting,
      expected: sum.expected + item.registers.expected,
      missed: sum.missed + item.registers.missed,
    }),
    { classes: 0, collected: 0, paid: 0, waiting: 0, expected: 0, missed: 0 }
  );
  // different students taught across all tutors
  const distinctStudents = await one(
    `SELECT COUNT(DISTINCT e.student_id) AS total
     FROM enrollments e JOIN classes c ON c.id = e.class_id
     WHERE e.status = 'ACTIVE' AND c.status = 'ACTIVE'`
  );

  // the key findings
  const highlights = [];
  if (details.length > 1) {
    const mostStudents = [...details].sort((a, b) => b.students - a.students)[0];
    const topEarner = [...details].sort((a, b) => b.collected - a.collected)[0];
    highlights.push(`${mostStudents.name} teaches the most students (${mostStudents.students}).`);
    if (topEarner.collected > 0) highlights.push(`${topEarner.name}'s classes collected the most fees (LKR ${money(topEarner.collected)}).`);
  }
  highlights.push(`LKR ${money(totals.paid)} was paid to tutors during the period.`);
  if (totals.missed > 0) highlights.push(`${totals.missed} class day(s) have no attendance marked.`);
  if (totals.waiting > 0) highlights.push(`LKR ${money(totals.waiting)} in payouts is still waiting to be transferred or retried.`);
  // tutors with no payout bank account on file
  const noAccount = details.filter((item) => !item.tutor.bank_account_number);
  if (noAccount.length > 0) {
    highlights.push(`${noAccount.map((item) => item.name).join(', ')} ${noAccount.length === 1 ? 'has' : 'have'} no payout bank account on file.`);
  }

  // the overview table and chart, then (unless summary only) a full report per tutor
  const sections = [
    section('Tutor overview', [
      table(
        [
          { key: 'name', label: 'Tutor' },
          { key: 'classes', label: 'Classes', format: 'number' },
          { key: 'students', label: 'Students', format: 'number' },
          { key: 'registerText', label: 'Registers marked', align: 'right', width: 'auto' },
          { key: 'attendance', label: 'Attendance', format: 'percent' },
          { key: 'signIns', label: 'Sign-ins', format: 'number' },
          { key: 'collected', label: 'Fees collected', format: 'money' },
          { key: 'paid', label: 'Paid to tutor', format: 'money' },
          { key: 'lastPaid', label: 'Last payout', format: 'date', width: 'auto' },
        ],
        details,
        { totals: ['classes', 'signIns', 'collected', 'paid'], emptyText: 'No tutors found.' }
      ),
      bars('Fees collected from each tutor\'s classes', details.map((item) => ({ label: item.name, value: item.collected })), 'money', {
        emptyText: 'No fees were collected in this period.',
      }),
    ], {
      intro: 'Registers marked = class days with attendance recorded, out of the class days that should have been taught (cancelled days, public holidays and classes with no students are left out).',
    }),
  ];
  if (details.length === 0) sections.push(section('Tutors', [note('No tutor accounts have been created yet.')]));

  // full report for every tutor, each starting on a new page
  if (params.detail !== 'summary') {
    details.forEach((item) => {
      const blocks = [tiles(item.kpis)];
      item.groups.forEach((group) => {
        blocks.push(heading(group.title));
        blocks.push(...group.blocks);
      });
      sections.push(section(item.name, blocks, { pageBreak: true, intro: item.highlights.join(' ') }));
    });
  }

  // the report - title, filters, key figures, key findings and sections
  return {
    title: 'Tutor Report',
    subtitle: `All tutors - ${params.detail === 'summary' ? 'overview' : 'overview plus a full report for each tutor'}`,
    orientation: 'landscape',
    filters: [
      { label: 'Tutor', value: 'All tutors' },
      { label: 'Content', value: params.detail === 'summary' ? 'Overview' : 'Overview + full report for each tutor' },
    ],
    summary: [
      kpi('Tutors', details.length),
      kpi('Active classes', totals.classes),
      kpi('Students taught', num(distinctStudents.total)),
      kpi('Registers marked', totals.expected ? `${totals.expected - totals.missed} / ${totals.expected}` : '-', 'text', {
        tone: totals.missed > 0 ? 'warning' : 'success',
      }),
      kpi('Fees collected', totals.collected, 'lkr0', { tone: 'success' }),
      kpi('Paid to tutors', totals.paid, 'lkr0', { note: totals.waiting > 0 ? `LKR ${money(totals.waiting)} waiting` : '' }),
    ],
    highlights,
    sections,
  };
}

// --- one tutor's complete picture ---
async function tutorDetail(tutor, { period }, shared) {
  // this tutor's classes
  const own = shared.classes.filter((item) => item.tutor_id === tutor.id);
  // the classes that are running
  const active = own.filter((item) => item.status === 'ACTIVE');

  // numbers for each of the tutor's classes
  const perClass = new Map();
  let marks = 0;
  let attended = 0;
  let collected = 0;
  let owed = 0;
  own.forEach((cls) => {
    const att = shared.attendance.get(cls.id) || { sessions: 0, marks: 0, present: 0, late: 0, rate: null };
    const row = {
      sessions: att.sessions,
      attendance: att.rate,
      collected: shared.collections.get(cls.id)?.collected || 0,
      owed: shared.outstanding.get(cls.id)?.owed || 0,
    };
    perClass.set(cls.id, row);
    marks += att.marks;
    attended += att.present + att.late;
    collected += row.collected;
    owed += row.owed;
  });

  // payouts to this tutor in the period
  const tutorPayouts = shared.payouts.filter((item) => item.tutor_id === tutor.id);
  // paid in the period
  const paid = tutorPayouts.filter(data.isPaid).reduce((sum, item) => sum + item.amount, 0);
  // still waiting or failed, from any date
  const waiting = shared.unsettled.filter((item) => item.tutor_id === tutor.id).reduce((sum, item) => sum + item.amount, 0);
  // every class day and whether its register was marked
  const register = await registerLog(tutor.id, own, period, shared);
  // counts of class days by register state
  const registers = {
    expected: register.filter((item) => !['CANCELLED', 'HOLIDAY', 'NOT_YET', 'NO_STUDENTS'].includes(item.status)).length,
    sameDay: register.filter((item) => item.status === 'SAME_DAY').length,
    later: register.filter((item) => item.status === 'MARKED_LATER').length,
    checkinsOnly: register.filter((item) => item.status === 'CHECKINS_ONLY').length,
    missed: register.filter((item) => item.status === 'NOT_MARKED').length,
    cancelled: register.filter((item) => item.status === 'CANCELLED').length,
    holidays: register.filter((item) => item.status === 'HOLIDAY').length,
  };

  // the tutor's students in each class
  const roster = await rows(
    `SELECT c.id AS class_id, c.subject, u.id AS student_id, u.full_name, u.student_code, u.grade, u.phone, e.enrolled_at, e.balance
     FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN users u ON u.id = e.student_id
     WHERE c.tutor_id = ? AND e.status = 'ACTIVE' AND c.status = 'ACTIVE'
     ORDER BY c.subject, u.full_name`,
    [tutor.id]
  );
  // each student's attendance in this tutor's classes
  const rosterAttendance = await rows(
    `SELECT cs.class_id, ar.student_id, COUNT(*) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id JOIN classes c ON c.id = cs.class_id
     WHERE c.tutor_id = ? AND cs.session_date BETWEEN ? AND ?
     GROUP BY cs.class_id, ar.student_id`,
    [tutor.id, period.from, period.to]
  );
  // attendance rate by class and student
  const rateMap = new Map(rosterAttendance.map((item) => [`${item.class_id}|${item.student_id}`, percent(item.attended, item.marks)]));
  // messages and reminders the tutor sent
  const messages = await rows(
    `SELECT message, sent_at, type, COUNT(*) AS recipients, MAX(sent_at > NOW()) AS upcoming
     FROM notification_log WHERE sent_by = ? AND sent_at >= ? AND sent_at < ?
     GROUP BY message, sent_at, type ORDER BY sent_at ASC`,
    [tutor.id, period.start, period.end]
  );
  // feedback tickets addressed to this tutor
  const tickets = await rows(
    `SELECT f.ticket_number, f.created_at, f.subject, f.category, f.priority, f.status, f.resolved_at, u.full_name AS from_name
     FROM feedback_complaints f JOIN users u ON u.id = f.submitted_by
     WHERE f.recipient_tutor_id = ? AND f.created_at >= ? AND f.created_at < ?
     ORDER BY f.created_at ASC`,
    [tutor.id, period.start, period.end]
  );
  // cancelled days and extra classes this tutor made
  const changes = shared.hasEvents
    ? await rows(
      `SELECT ce.created_at, ce.event_date, ce.type, ce.start_time, ce.end_time, ce.venue, ce.note, c.subject
       FROM class_events ce JOIN classes c ON c.id = ce.class_id
       WHERE ce.created_by = ? AND ce.created_at >= ? AND ce.created_at < ?
       ORDER BY ce.created_at ASC`,
      [tutor.id, period.start, period.end]
    )
    : null;
  // what the tutor did on the site, and what staff did on their account
  const siteActivity = await getActivity(tutor.id, period);
  const staffActions = await getStaffActions(tutor.id, period);

  // headline figures
  const students = num(shared.students.get(tutor.id)?.students);
  const rate = percent(attended, marks);
  const signIns = siteActivity.filter((item) => item.action === 'LOGIN_SUCCESS').length;
  const lifetimePaid = num(shared.lifetime.get(tutor.id)?.total);
  const lastPaid = shared.lifetime.get(tutor.id)?.last_paid || null;
  const ticketCounts = shared.feedback.get(tutor.id);
  const registerText = registers.expected ? `${registers.expected - registers.missed} / ${registers.expected}` : '-';

  // the key findings
  const highlights = [
    `${tutor.full_name} teaches ${active.length} active class${active.length === 1 ? '' : 'es'} with ${students} student${students === 1 ? '' : 's'}.`,
  ];
  if (registers.expected > 0) {
    highlights.push(
      `Attendance was recorded for ${registers.expected - registers.missed} of ${registers.expected} class days` +
        (registers.later > 0 ? ` (${registers.later} recorded on a later day)` : '') + '.'
    );
  }
  if (registers.missed > 0) highlights.push(`${registers.missed} class day(s) have no attendance marked.`);
  highlights.push(
    signIns > 0
      ? `Signed in ${signIns} time${signIns === 1 ? '' : 's'} and did ${siteActivity.length - signIns} other recorded action(s) on the site.`
      : 'Did not sign in to the site during the period.'
  );
  if (messages.length > 0) highlights.push(`Sent ${messages.length} message(s) or reminder(s) to students.`);
  highlights.push(`Paid LKR ${money(paid)} this period${waiting > 0 ? `; LKR ${money(waiting)} is still waiting` : ''}.`);

  // the parts of the report, one group per topic
  const groups = [
    {
      title: 'Tutor profile',
      intro: tutor.bio || '',
      blocks: [
        facts([
          { label: 'Full name', value: tutor.full_name },
          { label: 'Email', value: tutor.email },
          { label: 'Phone', value: tutor.phone },
          { label: 'Account status', value: tutor.status, format: 'status' },
          { label: 'Tutor since', value: tutor.created_at, format: 'date' },
          { label: 'Last sign-in', value: tutor.last_login_at, format: 'datetime' },
          {
            label: 'Payout account',
            value: parts.maskAccount(tutor.bank_name, tutor.bank_account_number) + (tutor.bank_branch ? `, ${tutor.bank_branch}` : ''),
          },
          { label: 'Paid in total', value: lifetimePaid, format: 'lkr' },
          { label: 'Last payout', value: lastPaid, format: 'date' },
          { label: 'Feedback tickets', value: `${num(ticketCounts?.total)} (${num(ticketCounts?.open_now)} open)` },
        ]),
      ],
    },
    {
      title: 'Classes',
      blocks: [
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'level', label: 'Level', width: 'auto' },
            { key: 'schedule', label: 'Schedule', width: 'auto' },
            { key: 'venue', label: 'Venue', width: 'auto' },
            { key: 'seats', label: 'Enrolled', align: 'right', width: 'auto' },
            { key: 'fee', label: 'Fee', format: 'money' },
            { key: 'sessions', label: 'Sessions', format: 'number' },
            { key: 'attendance', label: 'Attendance', format: 'percent' },
            { key: 'collected', label: 'Collected', format: 'money' },
            { key: 'owed', label: 'Outstanding', format: 'money' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
          ],
          own.map((cls) => ({
            subject: cls.subject,
            level: cls.level,
            schedule: parts.formatSchedule(cls.day_of_week, cls.start_time, cls.end_time, true),
            venue: cls.venue,
            seats: `${cls.enrolled} / ${cls.capacity}`,
            fee: cls.fee,
            status: cls.status,
            ...perClass.get(cls.id),
          })),
          { totals: ['sessions', 'collected', 'owed'], emptyText: 'This tutor has no classes.' }
        ),
      ],
    },
    {
      title: 'Students',
      blocks: [
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'grade', label: 'Grade', width: 'auto' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'enrolled_at', label: 'Joined', format: 'date', width: 'auto' },
            { key: 'attendance', label: 'Attendance', format: 'percent' },
            { key: 'balance', label: 'Balance', format: 'money' },
          ],
          roster.map((item) => ({ ...item, attendance: rateMap.get(`${item.class_id}|${item.student_id}`) ?? null })),
          { totals: ['balance'], emptyText: 'No students are enrolled in this tutor\'s classes.' }
        ),
      ],
    },
    {
      title: 'Attendance registers',
      intro: 'Every class day in the period: was attendance recorded, and when. Cancelled days, public holidays and classes with no students are not counted as missed.',
      blocks: [
        facts([
          { label: 'Class days to teach', value: registers.expected, format: 'number' },
          { label: 'Marked the same day', value: registers.sameDay, format: 'number' },
          { label: 'Marked on a later day', value: registers.later, format: 'number' },
          { label: 'Only student check-ins', value: registers.checkinsOnly, format: 'number' },
          { label: 'Not marked', value: registers.missed, format: 'number' },
          { label: 'Cancelled / holidays', value: `${registers.cancelled} / ${registers.holidays}` },
        ]),
        table(
          [
            { key: 'date', label: 'Class day', format: 'date', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'kind', label: 'Type', width: 'auto' },
            { key: 'present', label: 'Present', format: 'number' },
            { key: 'late', label: 'Late', format: 'number' },
            { key: 'absent', label: 'Absent', format: 'number' },
            { key: 'selfCheckins', label: 'Self check-ins', format: 'number' },
            { key: 'recordedAt', label: 'Recorded at', format: 'datetime', width: 'auto' },
            { key: 'status', label: 'Register', format: 'status', width: 'auto' },
            { key: 'note', label: 'Note' },
          ],
          register,
          { emptyText: 'No class days in this period.' }
        ),
      ],
    },
    changes
      ? {
        title: 'Schedule changes made',
        blocks: [
          table(
            [
              { key: 'created_at', label: 'Changed on', format: 'datetime', width: 'auto' },
              { key: 'subject', label: 'Class' },
              { key: 'type', label: 'Change', format: 'status', width: 'auto' },
              { key: 'event_date', label: 'For the day', format: 'date', width: 'auto' },
              { key: 'time', label: 'Time', width: 'auto' },
              { key: 'venue', label: 'Venue', width: 'auto' },
              { key: 'note', label: 'Note' },
            ],
            changes.map((item) => ({
              ...item,
              time: item.start_time ? `${parts.formatTime(item.start_time)} - ${parts.formatTime(item.end_time)}` : '-',
            })),
            { emptyText: 'No classes were cancelled or added by this tutor in the period.' }
          ),
        ],
      }
      : null,
    {
      title: 'Messages and reminders sent',
      blocks: [
        table(
          [
            { key: 'sent_at', label: 'Sent / goes out', format: 'datetime', width: 'auto' },
            { key: 'type', label: 'Type', format: 'label', width: 'auto' },
            { key: 'recipients', label: 'People', format: 'number' },
            { key: 'state', label: 'Status', format: 'status', width: 'auto' },
            { key: 'message', label: 'Message' },
          ],
          messages.map((item) => ({ ...item, recipients: num(item.recipients), state: Number(item.upcoming) ? 'SCHEDULED' : 'SENT' })),
          { emptyText: 'No messages or reminders were sent in this period.' }
        ),
      ],
    },
    {
      title: 'Feedback addressed to this tutor',
      blocks: [
        table(
          [
            { key: 'ticket_number', label: 'Ticket', width: 'auto' },
            { key: 'created_at', label: 'Received', format: 'date', width: 'auto' },
            { key: 'from_name', label: 'From' },
            { key: 'category', label: 'Category' },
            { key: 'subject', label: 'Subject' },
            { key: 'priority', label: 'Priority', format: 'status', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'resolved_at', label: 'Resolved', format: 'date', width: 'auto' },
          ],
          tickets,
          { emptyText: 'No feedback was sent to this tutor in the period.' }
        ),
      ],
    },
    {
      title: 'Payouts',
      blocks: [
        table(
          [
            { key: 'paid_at', label: 'Date', format: 'date', width: 'auto' },
            { key: 'period_label', label: 'For', width: 'auto' },
            { key: 'method', label: 'Method', format: 'label', width: 'auto' },
            { key: 'account', label: 'Paid to' },
            { key: 'provider_reference', label: 'Bank reference', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          tutorPayouts,
          { totals: ['amount'], emptyText: 'No payouts in this period.' }
        ),
      ],
    },
    {
      title: 'Activity on the site',
      intro: 'Every action this tutor took while signed in, and what staff did on their account, during the period.',
      blocks: activityBlocks(siteActivity, staffActions),
    },
  ].filter(Boolean);

  // what the report needs from this tutor - the figures, key findings and groups
  return {
    tutor,
    name: tutor.full_name,
    classes: active.length,
    students,
    collected,
    paid,
    waiting,
    lastPaid,
    signIns,
    attendance: rate,
    registers,
    registerText,
    kpis: [
      kpi('Active classes', active.length),
      kpi('Students', students),
      kpi('Registers marked', registerText, 'text', { tone: registers.missed > 0 ? 'warning' : 'success' }),
      kpi('Attendance', rate, 'percent'),
      kpi('Fees collected', collected, 'lkr0', { tone: 'success' }),
      kpi('Paid this period', paid, 'lkr0', { note: waiting > 0 ? `LKR ${money(waiting)} waiting` : '' }),
      kpi('Sign-ins', signIns, 'number', { note: `${siteActivity.length} actions in total` }),
    ],
    highlights,
    groups,
  };
}

// every class day in the period and whether its register was marked
async function registerLog(tutorId, classes, period, shared) {
  // count class days only up to today
  const today = parts.toDateKey(new Date());
  const last = period.to < today ? period.to : today;
  // the sessions held, with how many marks and who marked first
  const sessions = await rows(
    `SELECT cs.class_id, cs.session_date, COUNT(ar.id) AS marks, SUM(ar.status = 'PRESENT') AS present,
            SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent,
            SUM(ar.marked_by = ar.student_id) AS self_checkins,
            MIN(CASE WHEN ar.marked_by <> ar.student_id THEN ar.marked_at END) AS first_marked
     FROM class_sessions cs JOIN classes c ON c.id = cs.class_id
     LEFT JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE c.tutor_id = ? AND cs.session_date BETWEEN ? AND ?
     GROUP BY cs.id, cs.class_id, cs.session_date`,
    [tutorId, period.from, period.to]
  );
  // sessions by class and date
  const sessionMap = new Map(sessions.map((item) => [`${item.class_id}|${item.session_date}`, item]));
  const list = [];
  const seen = new Set();

  // for each active class, list its class days - the weekly day plus any extra classes
  classes
    .filter((cls) => cls.status === 'ACTIVE')
    .forEach((cls) => {
      // count from the class start, or its first recorded session if that is earlier
      let begin = String(cls.start_date || cls.created_at || period.from).slice(0, 10);
      const firstSession = sessions.filter((item) => item.class_id === cls.id).map((item) => item.session_date).sort()[0];
      if (firstSession && firstSession < begin) begin = firstSession;
      const first = begin > period.from ? begin : period.from;
      // cancelled days and extra classes of this class
      const classEvents = shared.events.filter((item) => item.class_id === cls.id);
      // weekly days plus extra classes
      const planned = new Map();
      for (let day = first; day <= last; day = parts.addDays(day, 1)) {
        if (weekdayOf(day) === cls.day_of_week) planned.set(day, 'Weekly');
      }
      classEvents.forEach((item) => {
        if (item.type === 'EXTRA' && item.event_date <= last) planned.set(item.event_date, 'Extra class');
      });
      planned.forEach((kind, day) => {
        const key = `${cls.id}|${day}`;
        seen.add(key);
        // was this day cancelled?
        const cancelled = classEvents.find((item) => item.type === 'CANCELLED' && item.event_date === day);
        list.push(registerRow(cls.subject, day, kind, sessionMap.get(key), {
          cancelled,
          holiday: shared.holidays.get(day),
          today,
          noStudents: cls.enrolled === 0,
        }));
      });
    });

  // registers marked on a day that was not planned (empty ones are not counted)
  sessions.forEach((session) => {
    const key = `${session.class_id}|${session.session_date}`;
    if (seen.has(key) || num(session.marks) === 0) return;
    // the class a stray session belongs to
    const cls = classes.find((item) => item.id === session.class_id);
    list.push(registerRow(cls ? cls.subject : 'Class', session.session_date, 'Other day', session, { today }));
  });

  // oldest class day first
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
}

// one class day and the state of its register (marked on the day, later, not marked, cancelled ...)
function registerRow(subject, day, kind, session, { cancelled, holiday, today, noStudents }) {
  const marks = num(session?.marks);
  let status = 'NOT_MARKED';
  if (marks > 0 && session.first_marked) status = session.first_marked.slice(0, 10) === day ? 'SAME_DAY' : 'MARKED_LATER';
  else if (marks > 0) status = 'CHECKINS_ONLY';
  else if (cancelled) status = 'CANCELLED';
  else if (holiday) status = 'HOLIDAY';
  else if (noStudents) status = 'NO_STUDENTS';
  else if (day === today) status = 'NOT_YET';
  return {
    date: day,
    subject,
    kind,
    present: marks ? num(session.present) : null,
    late: marks ? num(session.late) : null,
    absent: marks ? num(session.absent) : null,
    selfCheckins: marks ? num(session.self_checkins) : null,
    recordedAt: session?.first_marked || null,
    status,
    note: cancelled ? cancelled.note || 'Class cancelled' : holiday || '',
  };
}

module.exports = { code: 'TUT', build };
