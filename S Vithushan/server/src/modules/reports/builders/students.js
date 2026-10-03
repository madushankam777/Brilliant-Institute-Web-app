// Student report - every student, one student in full, or every student in full
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../../shared/server/src/utils/schemaFeatures');
const { GRADES } = require('../../../../../../shared/server/src/config/grades');
const parts = require('../reportParts');
const data = require('../reportData');
const { getActivity, getStaffActions, activityBlocks } = require('../reportActivity');

const { num, percent, kpi, table, bars, facts, tiles, heading, section, rows, one, money } = parts;

// more than this in one file is too slow - filter by grade instead
const MAX_FULL = 150;

async function build(params, context) {
  if (params.studentId) return buildOne(params.studentId, context);
  return buildAll(params, context);
}

// --- one student's complete picture, used for single and "every student" reports ---
async function studentDetail(student, { period, threshold }) {
  const enrolments = await rows(
    `SELECT e.status, e.balance, e.payment_status, e.enrolled_at, e.drop_date, c.subject, c.level, c.venue,
            c.day_of_week, c.start_time, c.end_time, c.fee, u.full_name AS tutor_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = c.tutor_id
     WHERE e.student_id = ?
     ORDER BY e.status, c.subject`,
    [student.id]
  );
  const payments = await rows(
    `SELECT COALESCE(p.paid_at, p.created_at) AS date, p.amount, p.status, p.payment_method, r.receipt_number, c.subject
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE p.student_id = ? AND COALESCE(p.paid_at, p.created_at) >= ? AND COALESCE(p.paid_at, p.created_at) < ?
     ORDER BY date ASC`,
    [student.id, period.start, period.end]
  );
  const allTime = await one(
    `SELECT COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS total FROM payments WHERE student_id = ? AND status = 'SUCCESSFUL'`,
    [student.id]
  );
  const attendance = await rows(
    `SELECT c.subject, COUNT(*) AS marks, SUM(ar.status = 'PRESENT') AS present, SUM(ar.status = 'LATE') AS late,
            SUM(ar.status = 'ABSENT') AS absent, SUM(ar.marked_by = ar.student_id) AS self_checkins
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     WHERE ar.student_id = ? AND cs.session_date BETWEEN ? AND ?
     GROUP BY c.id, c.subject
     ORDER BY c.subject`,
    [student.id, period.from, period.to]
  );
  const log = await rows(
    `SELECT cs.session_date, c.subject, ar.status, ar.remarks, ar.marked_at, ar.marked_by, mu.full_name AS marked_by_name
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users mu ON mu.id = ar.marked_by
     WHERE ar.student_id = ? AND cs.session_date BETWEEN ? AND ?
     ORDER BY cs.session_date DESC
     LIMIT 100`,
    [student.id, period.from, period.to]
  );
  const tickets = await rows(
    `SELECT ticket_number, created_at, category, subject, priority, status, resolved_at, JSON_LENGTH(responses) AS replies
     FROM feedback_complaints WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 50`,
    [student.id]
  );
  const notices = await rows(
    `SELECT sent_at, type, message FROM notification_log
     WHERE recipient_id = ? AND sent_at >= ? AND sent_at < ? AND sent_at <= NOW()
     ORDER BY sent_at DESC`,
    [student.id, period.start, period.end]
  );
  let rereg = null;
  if (await schema.hasReregistration()) {
    rereg = await rows(
      `SELECT academic_year, from_grade, to_grade, status, created_at, used_at
       FROM student_reregistration_keys WHERE student_id = ? ORDER BY academic_year DESC, created_at DESC LIMIT 6`,
      [student.id]
    );
  }
  const activity = await getActivity(student.id, period);
  const staffActions = await getStaffActions(student.id, period);

  const active = enrolments.filter((item) => item.status === 'ACTIVE');
  const owed = active.reduce((sum, item) => sum + num(item.balance), 0);
  const paid = payments.filter((item) => item.status === 'SUCCESSFUL').reduce((sum, item) => sum + num(item.amount), 0);
  const marks = attendance.reduce((sum, item) => sum + num(item.marks), 0);
  const attended = attendance.reduce((sum, item) => sum + num(item.present) + num(item.late), 0);
  const selfCheckins = attendance.reduce((sum, item) => sum + num(item.self_checkins), 0);
  const rate = percent(attended, marks);
  const openTickets = tickets.filter((item) => item.status !== 'RESOLVED').length;
  const signIns = activity.filter((item) => item.action === 'LOGIN_SUCCESS').length;

  const highlights = [
    `${student.full_name} is enrolled in ${active.length} active class${active.length === 1 ? '' : 'es'}.`,
    owed > 0 ? `An unpaid balance of LKR ${money(owed)} is outstanding.` : 'All class fees are fully paid.',
  ];
  if (rate !== null) {
    highlights.push(`Attended ${rate}% of marked sessions in the period${rate < threshold ? ` - below the ${threshold}% target` : ''}.`);
  }
  highlights.push(
    signIns > 0
      ? `Signed in ${signIns} time${signIns === 1 ? '' : 's'} and did ${activity.length - signIns} other recorded action(s) on the site.`
      : 'Did not sign in to the site during the period.'
  );
  if (selfCheckins > 0) highlights.push(`Checked in to class ${selfCheckins} time(s) with the class code.`);
  if (openTickets > 0) highlights.push(`${openTickets} feedback ticket(s) are still open.`);

  const noticeTypes = new Map();
  notices.forEach((item) => noticeTypes.set(item.type, (noticeTypes.get(item.type) || 0) + 1));

  const groups = [
    {
      title: 'Student profile',
      blocks: [
        facts([
          { label: 'Full name', value: student.full_name },
          { label: 'Student code', value: student.student_code },
          { label: 'Email', value: student.email },
          { label: 'Phone', value: student.phone },
          { label: 'Grade', value: student.grade },
          { label: 'Account status', value: student.status, format: 'status' },
          { label: 'Joined', value: student.created_at, format: 'date' },
          { label: 'Last sign-in', value: student.last_login_at, format: 'datetime' },
          { label: 'Paid since joining', value: num(allTime.total), format: 'lkr' },
          { label: 'Balance today', value: owed, format: 'lkr' },
          rereg ? { label: 'Re-registered for', value: student.reregistered_for_year || 'Not yet' } : null,
        ]),
      ],
    },
    {
      title: 'Classes and timetable',
      blocks: [
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'tutor_name', label: 'Tutor' },
            { key: 'schedule', label: 'Schedule' },
            { key: 'enrolled_at', label: 'Joined', format: 'date', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'fee', label: 'Fee', format: 'money' },
            { key: 'balance', label: 'Balance', format: 'money' },
          ],
          enrolments.map((item) => ({ ...item, schedule: parts.formatSchedule(item.day_of_week, item.start_time, item.end_time, true) })),
          { totals: ['balance'], emptyText: 'Not enrolled in any class.' }
        ),
      ],
    },
    {
      title: 'Fees and payments',
      blocks: [
        table(
          [
            { key: 'date', label: 'Date', format: 'datetime', width: 'auto' },
            { key: 'receipt_number', label: 'Receipt', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'payment_method', label: 'Method', format: 'label', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          payments,
          { emptyText: 'No payments in this period.' }
        ),
        facts([
          { label: 'Paid this period', value: paid, format: 'lkr' },
          { label: 'Paid since joining', value: `LKR ${money(allTime.total)} (${num(allTime.payments)} payments)` },
        ]),
      ],
    },
    {
      title: 'Attendance',
      blocks: [
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'marks', label: 'Sessions', format: 'number' },
            { key: 'present', label: 'Present', format: 'number' },
            { key: 'late', label: 'Late', format: 'number' },
            { key: 'absent', label: 'Absent', format: 'number' },
            { key: 'self_checkins', label: 'Self check-ins', format: 'number' },
            { key: 'rate', label: 'Rate', format: 'percent' },
          ],
          attendance.map((item) => ({ ...item, rate: percent(num(item.present) + num(item.late), item.marks) })),
          { title: 'By class', totals: ['marks', 'present', 'late', 'absent', 'self_checkins'], emptyText: 'No attendance was marked in this period.' }
        ),
        log.length > 0
          ? table(
            [
              { key: 'session_date', label: 'Date', format: 'date', width: 'auto' },
              { key: 'subject', label: 'Class' },
              { key: 'status', label: 'Status', format: 'status', width: 'auto' },
              { key: 'recordedBy', label: 'Recorded by' },
              { key: 'marked_at', label: 'Recorded at', format: 'datetime', width: 'auto' },
            ],
            log.map((item) => ({
              ...item,
              recordedBy: item.marked_by === student.id ? 'Self check-in (class code)' : item.marked_by_name || '-',
            })),
            { title: 'Session log (latest first)' }
          )
          : null,
      ],
    },
    {
      title: 'Feedback and complaints',
      blocks: [
        table(
          [
            { key: 'ticket_number', label: 'Ticket', width: 'auto' },
            { key: 'created_at', label: 'Opened', format: 'date', width: 'auto' },
            { key: 'category', label: 'Category' },
            { key: 'subject', label: 'Subject' },
            { key: 'replies', label: 'Replies', format: 'number' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
          ],
          tickets.map((item) => ({ ...item, replies: num(item.replies) })),
          { emptyText: 'No feedback submitted.' }
        ),
      ],
    },
    {
      title: 'Notifications received',
      blocks: [
        bars('Notifications by type', [...noticeTypes.entries()].map(([type, total]) => ({ label: parts.label(type), value: total })), 'number', {
          emptyText: 'No notifications were sent to this student in the period.',
        }),
        notices.length > 0
          ? table(
            [
              { key: 'sent_at', label: 'Sent', format: 'datetime', width: 'auto' },
              { key: 'type', label: 'Type', format: 'label', width: 'auto' },
              { key: 'message', label: 'Message' },
            ],
            notices.slice(0, 20),
            { title: `Latest messages${notices.length > 20 ? ` (20 of ${notices.length})` : ''}` }
          )
          : null,
      ],
    },
    rereg
      ? {
        title: 'Re-registration',
        blocks: [
          table(
            [
              { key: 'academic_year', label: 'Year', width: 'auto' },
              { key: 'move', label: 'Moving', width: 'auto' },
              { key: 'status', label: 'Key status', format: 'status', width: 'auto' },
              { key: 'created_at', label: 'Key issued', format: 'date', width: 'auto' },
              { key: 'used_at', label: 'Used on', format: 'date', width: 'auto' },
            ],
            rereg.map((item) => ({ ...item, move: `${item.from_grade || '-'} to ${item.to_grade}` })),
            { emptyText: 'No re-registration keys have been issued to this student.' }
          ),
        ],
      }
      : null,
    {
      title: 'Activity on the site',
      intro: 'Every action this student took while signed in, and what staff did on their account, during the period.',
      blocks: activityBlocks(activity, staffActions),
    },
  ].filter(Boolean);

  return {
    kpis: [
      kpi('Active classes', active.length),
      kpi('Paid this period', paid, 'lkr0', { tone: 'success' }),
      kpi('Outstanding', owed, 'lkr0', { tone: owed > 0 ? 'warning' : 'success' }),
      kpi('Attendance', rate, 'percent', { tone: rate !== null && rate < threshold ? 'warning' : 'success', note: `${marks} marked sessions` }),
      kpi('Sign-ins', signIns, 'number', { note: `${activity.length} actions in total` }),
      kpi('Open tickets', openTickets, 'number', { tone: openTickets > 0 ? 'warning' : 'success' }),
    ],
    highlights,
    groups,
  };
}

// one student, each part as its own numbered section
async function buildOne(studentId, context) {
  const student = await one(`SELECT * FROM users WHERE id = ? AND role = 'STUDENT_PARENT' AND status <> 'DELETED'`, [studentId]);
  if (!student.id) throw ApiError.notFound('Student not found.');
  const detail = await studentDetail(student, context);
  return {
    title: 'Student Report',
    subtitle: `${student.full_name}${student.student_code ? ` (${student.student_code})` : ''} - student statement`,
    orientation: 'portrait',
    filters: [{ label: 'Student', value: `${student.full_name}${student.student_code ? ` - ${student.student_code}` : ''}` }],
    summary: detail.kpis,
    highlights: detail.highlights,
    sections: detail.groups.map((group) => section(group.title, group.blocks, { intro: group.intro })),
  };
}

// --- all students ---
async function buildAll(params, context) {
  const { period, threshold } = context;
  const full = params.detail === 'full';
  const filter = params.grade ? 'AND grade = ?' : '';
  const students = await rows(
    `SELECT * FROM users
     WHERE role = 'STUDENT_PARENT' AND status <> 'DELETED' ${filter}
     ORDER BY full_name`,
    params.grade ? [params.grade] : []
  );
  if (full && students.length > MAX_FULL) {
    throw ApiError.badRequest(`${students.length} students is too many for one file. Choose a grade to split the report.`, [
      { field: 'grade', message: `Choose a grade - full reports are limited to ${MAX_FULL} students per file.` },
    ]);
  }
  const enrolments = await rows(
    `SELECT student_id, COUNT(*) AS classes, SUM(balance) AS owed, SUM(balance > 0) AS owing_classes
     FROM enrollments WHERE status = 'ACTIVE' GROUP BY student_id`
  );
  const paid = await rows(
    `SELECT student_id, COUNT(*) AS payments, SUM(amount) AS total
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY student_id`,
    [period.start, period.end]
  );
  const signIns = await rows(
    `SELECT actor_id, COUNT(*) AS total FROM audit_log
     WHERE action = 'LOGIN_SUCCESS' AND created_at >= ? AND created_at < ? GROUP BY actor_id`,
    [period.start, period.end]
  );
  const attendance = await data.getAttendanceByStudent(period);
  const enrolmentMap = data.byId(enrolments, 'student_id');
  const paidMap = data.byId(paid, 'student_id');
  const signInMap = data.byId(signIns, 'actor_id');

  const register = students.map((student) => {
    const enrolment = enrolmentMap.get(student.id) || {};
    return {
      code: student.student_code,
      name: student.full_name,
      grade: student.grade,
      status: student.status,
      classes: num(enrolment.classes),
      paid: num(paidMap.get(student.id)?.total),
      owed: num(enrolment.owed),
      owingClasses: num(enrolment.owing_classes),
      attendance: attendance.get(student.id)?.rate ?? null,
      signIns: num(signInMap.get(student.id)?.total),
      phone: student.phone,
      lastLogin: student.last_login_at,
    };
  });

  const active = students.filter((item) => item.status === 'ACTIVE').length;
  const newStudents = students.filter((item) => item.created_at >= period.start && item.created_at < period.end).length;
  const totalPaid = register.reduce((sum, item) => sum + item.paid, 0);
  const totalOwed = register.reduce((sum, item) => sum + item.owed, 0);
  const ids = new Set(students.map((item) => item.id));
  let marks = 0;
  let attended = 0;
  attendance.forEach((value, id) => {
    if (!ids.has(id)) return;
    marks += value.marks;
    attended += value.attended;
  });
  const averageAttendance = percent(attended, marks);
  const low = (await data.getLowAttendance(period, threshold)).filter((item) => ids.has(item.id));
  const owing = register.filter((item) => item.owed > 0).sort((a, b) => b.owed - a.owed);
  const neverSignedIn = register.filter((item) => item.signIns === 0 && item.status === 'ACTIVE').length;
  const gradeCounts = GRADES.map((grade) => ({ label: grade, value: students.filter((item) => item.grade === grade && item.status === 'ACTIVE').length }))
    .filter((item) => item.value > 0);

  const highlights = [
    `${active} active student${active === 1 ? '' : 's'}${params.grade ? ` in ${params.grade}` : ''}; ${newStudents} joined during the period.`,
    `Students paid LKR ${money(totalPaid)} in fees during the period.`,
  ];
  if (owing.length > 0) highlights.push(`${owing.length} student(s) owe a total of LKR ${money(totalOwed)}.`);
  if (low.length > 0) highlights.push(`${new Set(low.map((item) => item.id)).size} student(s) are below the ${threshold}% attendance target.`);
  if (neverSignedIn > 0) highlights.push(`${neverSignedIn} active student(s) did not sign in to the site during the period.`);

  const sections = [
    section('Students by grade', [bars('Active students in each grade', gradeCounts, 'number', { emptyText: 'No active students.' })]),
    section('Student register', [
      table(
        [
          { key: 'code', label: 'Code', width: 'auto' },
          { key: 'name', label: 'Student' },
          { key: 'grade', label: 'Grade', width: 'auto' },
          { key: 'status', label: 'Status', format: 'status', width: 'auto' },
          { key: 'phone', label: 'Phone', width: 'auto' },
          { key: 'classes', label: 'Classes', format: 'number' },
          { key: 'paid', label: 'Paid', format: 'money' },
          { key: 'owed', label: 'Outstanding', format: 'money' },
          { key: 'attendance', label: 'Attendance', format: 'percent' },
          { key: 'signIns', label: 'Sign-ins', format: 'number' },
          { key: 'lastLogin', label: 'Last sign-in', format: 'date', width: 'auto' },
        ],
        register,
        { totals: ['classes', 'paid', 'owed', 'signIns'], emptyText: 'No students match these filters.' }
      ),
    ], { intro: 'Paid and sign-ins are for the period. Outstanding = unpaid balance today. Attendance = share of marked sessions attended (present or late).' }),
    section('Outstanding balances', [
      table(
        [
          { key: 'code', label: 'Code', width: 'auto' },
          { key: 'name', label: 'Student' },
          { key: 'grade', label: 'Grade', width: 'auto' },
          { key: 'phone', label: 'Phone', width: 'auto' },
          { key: 'owingClasses', label: 'Classes owing', format: 'number' },
          { key: 'owed', label: 'Outstanding', format: 'money' },
        ],
        owing,
        { totals: ['owed'], emptyText: 'Every student is fully paid.' }
      ),
    ]),
    section(`Attendance below ${threshold}%`, [
      table(
        [
          { key: 'student_code', label: 'Code', width: 'auto' },
          { key: 'full_name', label: 'Student' },
          { key: 'grade', label: 'Grade', width: 'auto' },
          { key: 'subject', label: 'Class' },
          { key: 'marks', label: 'Sessions', format: 'number' },
          { key: 'attended', label: 'Attended', format: 'number' },
          { key: 'rate', label: 'Rate', format: 'percent' },
        ],
        low,
        { emptyText: `No student is below ${threshold}% in this period.` }
      ),
    ]),
  ];

  // a full report for every student, each starting on a new page
  if (full) {
    for (const student of students) {
      const detail = await studentDetail(student, context);
      const blocks = [tiles(detail.kpis)];
      detail.groups.forEach((group) => {
        blocks.push(heading(group.title));
        blocks.push(...group.blocks);
      });
      sections.push(
        section(`${student.full_name}${student.student_code ? ` (${student.student_code})` : ''}`, blocks, {
          pageBreak: true,
          intro: detail.highlights.join(' '),
        })
      );
    }
  }

  return {
    title: 'Student Report',
    subtitle: `${params.grade ? `${params.grade} students` : 'All students'} - ${full ? 'register plus a full report for each student' : 'enrolments, fees, attendance and activity'}`,
    orientation: 'landscape',
    filters: [
      { label: 'Students', value: params.grade ? params.grade : 'All grades' },
      { label: 'Content', value: full ? 'Summary + full report for each student' : 'Summary' },
    ],
    summary: [
      kpi('Students', students.length),
      kpi('Active', active, 'number', { tone: 'success' }),
      kpi('New this period', newStudents),
      kpi('Fees paid', totalPaid, 'lkr0', { tone: 'success' }),
      kpi('Outstanding', totalOwed, 'lkr0', { tone: totalOwed > 0 ? 'warning' : 'success', note: `${owing.length} student(s)` }),
      kpi('Average attendance', averageAttendance, 'percent', { tone: averageAttendance !== null && averageAttendance < threshold ? 'warning' : 'success' }),
    ],
    highlights,
    sections,
  };
}

module.exports = { code: 'STU', build };
