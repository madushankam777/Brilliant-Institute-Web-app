// numbers for the admin Analytics dashboard (drawn with Apache ECharts)
const { GRADES } = require('../../../../../shared/server/src/config/grades');
const config = require('../../../../../shared/server/src/config/env');
const parts = require('./reportParts');
const data = require('./reportData');

const { num, percent, change, kpi, rows, one } = parts;
// short month names
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// days for short periods, weeks for a few months, months for longer
function granularityFor(period) {
  if (period.days <= 45) return 'day';
  if (period.days <= 200) return 'week';
  return 'month';
}

// SQL that turns a date column into its bucket key (column names are fixed, never from the request)
function bucketSql(column, granularity) {
  if (granularity === 'day') return `DATE_FORMAT(${column}, '%Y-%m-%d')`;
  if (granularity === 'week') return `DATE_FORMAT(DATE_SUB(${column}, INTERVAL WEEKDAY(${column}) DAY), '%Y-%m-%d')`;
  return `DATE_FORMAT(${column}, '%Y-%m')`;
}

// the bucket a date falls in: the day, the Monday of its week, or its month
function bucketOf(dateKey, granularity) {
  const day = String(dateKey).slice(0, 10);
  if (granularity === 'month') return day.slice(0, 7);
  if (granularity === 'week') return parts.addDays(day, -((new Date(`${day}T00:00:00`).getDay() + 6) % 7));
  return day;
}

// every bucket in the period, so empty days/weeks/months still show
function bucketKeys(period, granularity) {
  if (granularity === 'month') return parts.monthKeys(period.from, period.to);
  const keys = [];
  let day = bucketOf(period.from, granularity);
  const step = granularity === 'week' ? 7 : 1;
  for (; day <= period.to; day = parts.addDays(day, step)) keys.push(day);
  return keys;
}

// the text on the chart for a bucket - a day, a week (w/c = week commencing) or a month
function bucketLabel(key, granularity) {
  if (granularity === 'month') return parts.monthLabel(key);
  const [, m, d] = key.split('-');
  const text = `${d} ${MONTHS[Number(m) - 1]}`;
  return granularity === 'week' ? `w/c ${text}` : text;
}

// lines up a query result with the bucket keys
function series(keys, list, field = 'total') {
  const map = new Map(list.map((item) => [item.bucket, num(item[field])]));
  return keys.map((key) => map.get(key) || 0);
}

// all the numbers for the Analytics page - money, attendance, classes, tutors, students, feedback and site use
async function getAnalytics({ from, to }) {
  // the date range, and a bucket size (day, week or month) that suits its length
  const period = parts.resolvePeriod(from, to);
  const granularity = granularityFor(period);
  const keys = bucketKeys(period, granularity);
  const range = [period.start, period.end];
  const dates = [period.from, period.to];

  // money in and out
  const collectedRows = await rows(
    `SELECT ${bucketSql('paid_at', granularity)} AS bucket, SUM(amount) AS total, COUNT(*) AS payments
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ? GROUP BY bucket`,
    range
  );
  const payouts = await data.getPayouts(period);
  const payoutMap = new Map();
  payouts.filter(data.isPaid).forEach((item) => {
    const key = bucketOf(item.paid_at, granularity);
    payoutMap.set(key, (payoutMap.get(key) || 0) + item.amount);
  });
  const methods = await rows(
    `SELECT payment_method AS name, SUM(amount) AS value, COUNT(*) AS payments
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ? GROUP BY payment_method ORDER BY value DESC`,
    range
  );

  // attendance over time
  const attendanceRows = await rows(
    `SELECT ${bucketSql('cs.session_date', granularity)} AS bucket, COUNT(ar.id) AS marks,
            SUM(ar.status = 'PRESENT') AS present, SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent
     FROM class_sessions cs JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ? GROUP BY bucket`,
    dates
  );
  const attendanceMap = new Map(attendanceRows.map((item) => [item.bucket, item]));

  // attendance heat map: class x week
  const weekKeys = bucketKeys(period, 'week').slice(-16);
  const heatRows = await rows(
    `SELECT cs.class_id, ${bucketSql('cs.session_date', 'week')} AS bucket, COUNT(ar.id) AS marks,
            SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM class_sessions cs JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ? GROUP BY cs.class_id, bucket`,
    [weekKeys[0] || period.from, period.to]
  );

  // classes and tutors
  const classes = (await data.getClasses()).filter((item) => item.status === 'ACTIVE');
  const collections = await data.getCollectionsByClass(period);
  const outstanding = await data.getOutstandingByClass();
  const attendanceByClass = await data.getAttendanceByClass(period);
  const tutorRows = await rows(
    `SELECT u.id, u.full_name AS name,
            (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN classes c ON c.id = e.class_id
             WHERE c.tutor_id = u.id AND e.status = 'ACTIVE' AND c.status = 'ACTIVE') AS students
     FROM users u WHERE u.role = 'TUTOR' AND u.status = 'ACTIVE' ORDER BY u.full_name`
  );
  // per tutor - students, classes, fees collected, paid out and attendance
  const tutors = tutorRows.map((tutor) => {
    // this tutor's active classes
    const own = classes.filter((item) => item.tutor_id === tutor.id);
    let marks = 0;
    let attended = 0;
    let collected = 0;
    own.forEach((cls) => {
      const att = attendanceByClass.get(cls.id);
      if (att) {
        marks += att.marks;
        attended += att.present + att.late;
      }
      collected += collections.get(cls.id)?.collected || 0;
    });
    // what this tutor was paid in the period
    const paid = payouts.filter((item) => item.tutor_id === tutor.id && data.isPaid(item)).reduce((sum, item) => sum + item.amount, 0);
    return { id: tutor.id, name: tutor.name, students: num(tutor.students), classes: own.length, collected, paid, attendance: percent(attended, marks) };
  });

  // students
  const grades = await rows(
    `SELECT COALESCE(grade, 'Not set') AS name, COUNT(*) AS value
     FROM users WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE' GROUP BY grade`
  );
  // grades in school order, unknown ones last
  const gradeOrder = (name) => (GRADES.includes(name) ? GRADES.indexOf(name) : 99);
  grades.sort((a, b) => gradeOrder(a.name) - gradeOrder(b.name));
  const subjects = await rows(
    `SELECT COALESCE(c.subject_area, 'Other') AS name, COUNT(*) AS value
     FROM enrollments e JOIN classes c ON c.id = e.class_id
     WHERE e.status = 'ACTIVE' AND c.status = 'ACTIVE' GROUP BY name ORDER BY value DESC`
  );
  const newStudents = await rows(
    `SELECT ${bucketSql('created_at', granularity)} AS bucket, COUNT(*) AS total
     FROM users WHERE role = 'STUDENT_PARENT' AND created_at >= ? AND created_at < ? GROUP BY bucket`,
    range
  );
  const newEnrolments = await rows(
    `SELECT ${bucketSql('enrolled_at', granularity)} AS bucket, COUNT(*) AS total
     FROM enrollments WHERE enrolled_at >= ? AND enrolled_at < ? GROUP BY bucket`,
    range
  );

  // support
  const feedbackRows = await rows(
    `SELECT ${bucketSql('created_at', granularity)} AS bucket, status, COUNT(*) AS total
     FROM feedback_complaints WHERE created_at >= ? AND created_at < ? GROUP BY bucket, status`,
    range
  );
  const categories = await rows(
    `SELECT category AS name, COUNT(*) AS value FROM feedback_complaints
     WHERE created_at >= ? AND created_at < ? GROUP BY category ORDER BY value DESC`,
    range
  );

  // site usage: sign-ins by role
  const signInRows = await rows(
    `SELECT ${bucketSql('a.created_at', granularity)} AS bucket, u.role, COUNT(*) AS total
     FROM audit_log a JOIN users u ON u.id = a.actor_id
     WHERE a.action = 'LOGIN_SUCCESS' AND a.created_at >= ? AND a.created_at < ? GROUP BY bucket, u.role`,
    range
  );

  // headline figures
  const collectedTotal = collectedRows.reduce((sum, item) => sum + num(item.total), 0);
  const previous = await data.getCollectedTotal(period.previous);
  // headline figures - unpaid fees, paid to tutors, attendance
  const owedTotal = [...outstanding.values()].reduce((sum, item) => sum + item.owed, 0);
  const paidOut = [...payoutMap.values()].reduce((sum, value) => sum + value, 0);
  const marks = attendanceRows.reduce((sum, item) => sum + num(item.marks), 0);
  const attended = attendanceRows.reduce((sum, item) => sum + num(item.present) + num(item.late), 0);
  const attendanceRate = percent(attended, marks);
  const counts = await one(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE') AS students,
            (SELECT COUNT(*) FROM feedback_complaints WHERE status <> 'RESOLVED') AS open_tickets`
  );
  const growth = change(collectedTotal, previous.total);
  const threshold = config.business.lowAttendanceThresholdPercent;

  // the answer - the KPI tiles, then the data for each chart
  return {
    period: { from: period.from, to: period.to, label: period.label, granularity },
    kpis: [
      kpi('Active students', num(counts.students), 'number', { note: `${newStudents.reduce((sum, item) => sum + num(item.total), 0)} new this period` }),
      kpi('Fees collected', collectedTotal, 'lkr0', {
        tone: 'success',
        note: growth === null ? `${collectedRows.reduce((sum, item) => sum + num(item.payments), 0)} payments` : `${growth >= 0 ? '+' : ''}${growth}% vs previous period`,
      }),
      kpi('Paid to tutors', paidOut, 'lkr0'),
      kpi('Outstanding fees', owedTotal, 'lkr0', { tone: owedTotal > 0 ? 'warning' : 'success', note: 'unpaid today' }),
      kpi('Attendance rate', attendanceRate, 'percent', {
        tone: attendanceRate !== null && attendanceRate < threshold ? 'warning' : 'success',
        note: `target ${threshold}%`,
      }),
      kpi('Open complaints', num(counts.open_tickets), 'number', { tone: num(counts.open_tickets) > 0 ? 'warning' : 'success' }),
    ],
    labels: keys.map((key) => bucketLabel(key, granularity)),
    money: {
      collected: series(keys, collectedRows),
      payments: series(keys, collectedRows, 'payments'),
      payouts: keys.map((key) => payoutMap.get(key) || 0),
    },
    methods: methods.map((item) => ({ name: parts.label(item.name), key: item.name, value: num(item.value), payments: num(item.payments) })),
    attendance: {
      rate: keys.map((key) => {
        const item = attendanceMap.get(key);
        return item ? percent(num(item.present) + num(item.late), item.marks) : null;
      }),
      present: keys.map((key) => num(attendanceMap.get(key)?.present)),
      late: keys.map((key) => num(attendanceMap.get(key)?.late)),
      absent: keys.map((key) => num(attendanceMap.get(key)?.absent)),
      threshold,
    },
    heatmap: {
      weeks: weekKeys.map((key) => bucketLabel(key, 'week')),
      classes: classes.map((item) => ({ id: item.id, name: item.subject })),
      cells: heatRows
        .map((item) => [weekKeys.indexOf(item.bucket), classes.findIndex((cls) => cls.id === item.class_id), percent(item.attended, item.marks)])
        .filter((cell) => cell[0] >= 0 && cell[1] >= 0),
    },
    classes: classes.map((item) => ({
      id: item.id,
      name: item.subject,
      tutor: item.tutor_name,
      enrolled: item.enrolled,
      capacity: item.capacity,
      collected: collections.get(item.id)?.collected || 0,
      owed: outstanding.get(item.id)?.owed || 0,
      attendance: attendanceByClass.get(item.id)?.rate ?? null,
    })),
    tutors,
    students: {
      grades: grades.map((item) => ({ name: item.name, value: num(item.value) })),
      subjects: subjects.map((item) => ({ name: item.name, value: num(item.value) })),
      newStudents: series(keys, newStudents),
      newEnrolments: series(keys, newEnrolments),
    },
    feedback: {
      pending: series(keys, feedbackRows.filter((item) => item.status === 'PENDING')),
      inProgress: series(keys, feedbackRows.filter((item) => item.status === 'IN_PROGRESS')),
      resolved: series(keys, feedbackRows.filter((item) => item.status === 'RESOLVED')),
      categories: categories.map((item) => ({ name: item.name, value: num(item.value) })),
    },
    usage: {
      students: series(keys, signInRows.filter((item) => item.role === 'STUDENT_PARENT')),
      tutors: series(keys, signInRows.filter((item) => item.role === 'TUTOR')),
      admins: series(keys, signInRows.filter((item) => item.role === 'ADMIN')),
    },
  };
}

module.exports = { getAnalytics };
