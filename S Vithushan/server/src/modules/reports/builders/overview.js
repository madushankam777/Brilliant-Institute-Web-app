// Institute summary - the whole institute on a few pages
const schema = require('../../../../../../shared/server/src/utils/schemaFeatures');
const { GRADES } = require('../../../../../../shared/server/src/config/grades');
const parts = require('../reportParts');
const data = require('../reportData');

const { num, percent, change, kpi, table, bars, columnChart, facts, section, rows, one, money } = parts;

// institute summary - gather the numbers, then build the money, people, teaching and support sections
async function build(params, { period, threshold }) {
  // student, tutor and new student counts
  const people = await one(
    `SELECT SUM(role = 'STUDENT_PARENT' AND status = 'ACTIVE') AS students,
            SUM(role = 'TUTOR' AND status = 'ACTIVE') AS tutors,
            SUM(role = 'STUDENT_PARENT' AND created_at >= ? AND created_at < ?) AS new_students
     FROM users`,
    [period.start, period.end]
  );
  // active classes
  const classCount = await one(`SELECT COUNT(*) AS total FROM classes WHERE status = 'ACTIVE'`);
  // fees collected in this period and in the one before it
  const collected = await data.getCollectedTotal(period);
  const previous = await data.getCollectedTotal(period.previous);
  // unpaid balances right now
  const outstanding = await one(
    `SELECT COUNT(*) AS enrolments, COALESCE(SUM(balance), 0) AS total FROM enrollments WHERE status = 'ACTIVE' AND balance > 0`
  );
  // bank transfer slips waiting for verification
  const pending = await one(
    `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
     FROM payments WHERE status = 'PENDING' AND payment_method = 'BANK_TRANSFER'`
  );
  // money paid to tutors in the period
  const payouts = await data.getPayouts(period);
  // total paid to tutors
  const paidOut = payouts.filter(data.isPaid).reduce((sum, item) => sum + item.amount, 0);

  // attendance marks in the period
  const attendance = await one(
    `SELECT COUNT(*) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id
     WHERE cs.session_date BETWEEN ? AND ?`,
    [period.from, period.to]
  );
  const sessions = await one(`SELECT COUNT(*) AS total FROM class_sessions WHERE session_date BETWEEN ? AND ?`, [period.from, period.to]);
  const attendanceRate = percent(attendance.attended, attendance.marks);
  const lowAttendance = await data.getLowAttendance(period, threshold);
  const lowStudents = new Set(lowAttendance.map((item) => item.id)).size;

  // complaints received and resolved, and how many are open
  const feedback = await one(
    `SELECT SUM(created_at >= ? AND created_at < ?) AS received,
            SUM(resolved_at >= ? AND resolved_at < ?) AS resolved,
            SUM(status <> 'RESOLVED') AS open_now,
            SUM(status <> 'RESOLVED' AND priority = 'HIGH') AS high_open,
            AVG(CASE WHEN resolved_at >= ? AND resolved_at < ? THEN TIMESTAMPDIFF(MINUTE, created_at, resolved_at) END) / 60 AS hours
     FROM feedback_complaints`,
    [period.start, period.end, period.start, period.end, period.start, period.end]
  );

  // fees by payment method
  const methods = await rows(
    `SELECT payment_method, COUNT(*) AS payments, SUM(amount) AS total
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY payment_method ORDER BY total DESC`,
    [period.start, period.end]
  );

  // six months up to the end of the period
  const firstMonth = new Date(Number(period.to.slice(0, 4)), Number(period.to.slice(5, 7)) - 6, 1);
  const trendFrom = parts.toDateKey(firstMonth);
  const trend = await data.getMonthlyCollections(trendFrom, parts.addDays(period.to, 1), parts.monthKeys(trendFrom, period.to));

  // active students per grade
  const grades = await rows(
    `SELECT COALESCE(grade, 'Not set') AS grade, COUNT(*) AS total
     FROM users WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE' GROUP BY grade`
  );
  grades.sort((a, b) => indexOfGrade(a.grade) - indexOfGrade(b.grade));

  // the active classes with their enrolment, fees and attendance
  const classes = (await data.getClasses()).filter((item) => item.status === 'ACTIVE');
  const collections = await data.getCollectionsByClass(period);
  const attendanceByClass = await data.getAttendanceByClass(period);
  // the 10 biggest classes
  const topClasses = [...classes].sort((a, b) => b.enrolled - a.enrolled).slice(0, 10);
  const topEarner = [...classes].sort(
    (a, b) => (collections.get(b.id)?.collected || 0) - (collections.get(a.id)?.collected || 0)
  )[0];

  // Contact Us messages (only when that table exists)
  let enquiries = null;
  if (await schema.hasTable('contact_messages')) {
    enquiries = await one(
      `SELECT COUNT(*) AS received, SUM(status = 'HANDLED') AS handled
       FROM contact_messages WHERE created_at >= ? AND created_at < ?`,
      [period.start, period.end]
    );
  }
  // cancelled days and extra classes (only when that table exists)
  let changes = null;
  if (await schema.hasClassEvents()) {
    changes = await one(
      `SELECT SUM(type = 'CANCELLED') AS cancelled, SUM(type = 'EXTRA') AS extra
       FROM class_events WHERE event_date BETWEEN ? AND ?`,
      [period.from, period.to]
    );
  }

  // the key findings - plain sentences about the biggest numbers
  const collectedChange = change(collected.total, previous.total);
  const highlights = [];
  if (collectedChange !== null) {
    highlights.push(
      `Fees collected ${collectedChange >= 0 ? 'rose' : 'fell'} ${Math.abs(collectedChange)}% compared with the previous period ` +
        `(LKR ${money(previous.total)} to LKR ${money(collected.total)}).`
    );
  } else {
    highlights.push(`LKR ${money(collected.total)} was collected in fees during the period.`);
  }
  highlights.push(`${num(people.new_students)} new student${num(people.new_students) === 1 ? '' : 's'} registered during the period.`);
  if (num(pending.total) > 0) {
    highlights.push(`${num(pending.total)} bank transfer slip(s) worth LKR ${money(pending.amount)} are waiting for verification.`);
  }
  if (lowStudents > 0) {
    highlights.push(`${lowStudents} student(s) attended fewer than ${threshold}% of their classes.`);
  }
  if (topEarner && collections.get(topEarner.id)) {
    highlights.push(`${topEarner.subject} collected the most fees (LKR ${money(collections.get(topEarner.id).collected)}).`);
  }
  if (num(feedback.high_open) > 0) highlights.push(`${num(feedback.high_open)} high-priority complaint(s) are still open.`);

  // the report - title, key figures, key findings and sections
  return {
    title: 'Institute Summary Report',
    subtitle: 'Students, classes, fees, attendance and support at a glance',
    orientation: 'portrait',
    summary: [
      kpi('Active students', num(people.students)),
      kpi('Active tutors', num(people.tutors)),
      kpi('Active classes', num(classCount.total)),
      kpi('Fees collected', collected.total, 'lkr0', {
        tone: 'success',
        note: collectedChange === null ? `${collected.payments} payments` : `${collectedChange >= 0 ? '+' : ''}${collectedChange}% vs previous period`,
      }),
      kpi('Outstanding fees', num(outstanding.total), 'lkr0', { tone: num(outstanding.total) > 0 ? 'warning' : 'success', note: `${num(outstanding.enrolments)} enrolments` }),
      kpi('Paid to tutors', paidOut, 'lkr0'),
      kpi('Attendance rate', attendanceRate, 'percent', {
        tone: attendanceRate !== null && attendanceRate < threshold ? 'warning' : 'success',
        note: `${num(sessions.total)} sessions held`,
      }),
      kpi('Open complaints', num(feedback.open_now), 'number', { tone: num(feedback.open_now) > 0 ? 'warning' : 'success' }),
    ],
    highlights,
    sections: [
      section('Financial position', [
        columnChart('Fees collected - last six months', trend.map((item) => ({ label: parts.monthLabel(item.key), value: item.total })), 'money'),
        table(
          [
            { key: 'method', label: 'Payment method', format: 'label' },
            { key: 'payments', label: 'Payments', format: 'number' },
            { key: 'total', label: 'Amount', format: 'money' },
            { key: 'share', label: 'Share', format: 'percent' },
          ],
          methods.map((item) => ({ method: item.payment_method, payments: num(item.payments), total: num(item.total), share: percent(item.total, collected.total) })),
          { title: 'Collections by payment method', totals: ['payments', 'total'], emptyText: 'No fees were collected in this period.' }
        ),
        facts([
          { label: 'Fees collected', value: collected.total, format: 'lkr' },
          { label: 'Previous period', value: previous.total, format: 'lkr' },
          { label: 'Paid to tutors', value: paidOut, format: 'lkr' },
          { label: 'Net after payouts', value: collected.total - paidOut, format: 'lkr' },
          { label: 'Outstanding fees', value: num(outstanding.total), format: 'lkr' },
          { label: 'Awaiting verification', value: `${num(pending.total)} slip(s) - LKR ${money(pending.amount)}` },
        ], 'Money summary'),
      ], { intro: `Fees counted are payments marked successful between ${period.label}.` }),
      section('Students and classes', [
        bars('Active students by grade', grades.map((item) => ({ label: item.grade, value: num(item.total) })), 'number'),
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'tutor', label: 'Tutor' },
            { key: 'enrolled', label: 'Enrolled', format: 'number' },
            { key: 'capacity', label: 'Capacity', format: 'number' },
            { key: 'fill', label: 'Filled', format: 'percent' },
            { key: 'collected', label: 'Collected', format: 'money' },
          ],
          topClasses.map((item) => ({
            subject: item.subject,
            tutor: item.tutor_name,
            enrolled: item.enrolled,
            capacity: item.capacity,
            fill: percent(item.enrolled, item.capacity),
            collected: collections.get(item.id)?.collected || 0,
          })),
          { title: 'Largest classes', emptyText: 'There are no active classes.' }
        ),
      ]),
      section('Teaching and attendance', [
        facts([
          { label: 'Sessions held', value: num(sessions.total), format: 'number' },
          { label: 'Attendance marks', value: num(attendance.marks), format: 'number' },
          { label: 'Attendance rate', value: attendanceRate, format: 'percent' },
          { label: `Below ${threshold}%`, value: `${lowStudents} student(s)` },
          changes ? { label: 'Cancelled class days', value: num(changes.cancelled), format: 'number' } : null,
          changes ? { label: 'Extra classes', value: num(changes.extra), format: 'number' } : null,
        ]),
        bars(
          'Attendance rate by class',
          classes
            .map((item) => ({ label: item.subject, value: attendanceByClass.get(item.id)?.rate }))
            .filter((item) => item.value !== null && item.value !== undefined)
            .sort((a, b) => b.value - a.value),
          'percent',
          { max: 100, emptyText: 'No attendance was marked in this period.' }
        ),
      ]),
      section('Support and enquiries', [
        facts([
          { label: 'Feedback received', value: num(feedback.received), format: 'number' },
          { label: 'Feedback resolved', value: num(feedback.resolved), format: 'number' },
          { label: 'Open right now', value: num(feedback.open_now), format: 'number' },
          { label: 'Average resolution', value: feedback.hours === null ? null : num(feedback.hours), format: 'hours' },
          enquiries ? { label: 'Enquiries received', value: num(enquiries.received), format: 'number' } : null,
          enquiries ? { label: 'Enquiries answered', value: num(enquiries.handled), format: 'number' } : null,
        ]),
      ]),
    ],
  };
}

// position of a grade in school order, unknown grades last
function indexOfGrade(grade) {
  const index = GRADES.indexOf(grade);
  return index === -1 ? 99 : index;
}

module.exports = { code: 'SUM', build };
