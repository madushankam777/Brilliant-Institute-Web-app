// Attendance report - sessions, attendance rates and students below the target
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const parts = require('../reportParts');
const data = require('../reportData');

const { num, percent, kpi, table, bars, columnChart, section, rows, one } = parts;

async function build(params, { period, threshold }) {
  let className = 'All classes';
  if (params.classId) {
    const cls = await one('SELECT subject FROM classes WHERE id = ?', [params.classId]);
    if (!cls.subject) throw ApiError.notFound('Class not found.');
    className = cls.subject;
  }
  const classFilter = params.classId ? 'AND cs.class_id = ?' : '';
  const classParams = params.classId ? [params.classId] : [];

  const totals = await one(
    `SELECT COUNT(DISTINCT cs.id) AS sessions, COUNT(ar.id) AS marks, SUM(ar.status = 'PRESENT') AS present,
            SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent
     FROM class_sessions cs LEFT JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ? ${classFilter}`,
    [period.from, period.to, ...classParams]
  );
  const marks = num(totals.marks);
  const present = num(totals.present);
  const late = num(totals.late);
  const absent = num(totals.absent);
  const rate = percent(present + late, marks);

  // weekly buckets for short periods, monthly for long ones
  const weekly = period.days <= 120;
  const bucketSql = weekly ? "DATE_FORMAT(DATE_SUB(cs.session_date, INTERVAL WEEKDAY(cs.session_date) DAY), '%Y-%m-%d')" : "DATE_FORMAT(cs.session_date, '%Y-%m')";
  const trend = await rows(
    `SELECT ${bucketSql} AS bucket, COUNT(ar.id) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM class_sessions cs JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ? ${classFilter}
     GROUP BY bucket ORDER BY bucket`,
    [period.from, period.to, ...classParams]
  );

  const classes = await data.getClasses({ classId: params.classId });
  const byClass = await data.getAttendanceByClass(period);
  const classRows = classes
    .filter((item) => byClass.get(item.id))
    .map((item) => ({ subject: item.subject, tutor: item.tutor_name, ...byClass.get(item.id) }))
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

  const low = await data.getLowAttendance(period, threshold, params.classId);
  const perfect = await rows(
    `SELECT u.full_name, u.student_code, COUNT(*) AS marks
     FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id JOIN users u ON u.id = ar.student_id
     WHERE cs.session_date BETWEEN ? AND ? ${classFilter}
     GROUP BY u.id, u.full_name, u.student_code
     HAVING marks >= 4 AND SUM(ar.status = 'PRESENT') = marks
     ORDER BY marks DESC, u.full_name`,
    [period.from, period.to, ...classParams]
  );
  const sessions = await rows(
    `SELECT cs.session_date, c.subject, COUNT(ar.id) AS marks, SUM(ar.status = 'PRESENT') AS present,
            SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent
     FROM class_sessions cs JOIN classes c ON c.id = cs.class_id
     LEFT JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ? ${classFilter}
     GROUP BY cs.id, cs.session_date, c.subject
     ORDER BY cs.session_date ASC, c.subject ASC`,
    [period.from, period.to, ...classParams]
  );

  const highlights = [];
  if (marks === 0) {
    highlights.push('No attendance was marked in this period.');
  } else {
    highlights.push(`Overall attendance was ${rate}% across ${num(totals.sessions)} sessions (${present} present, ${late} late, ${absent} absent).`);
    if (classRows.length > 1) {
      const best = classRows[classRows.length - 1];
      const worst = classRows[0];
      highlights.push(`Best attendance: ${best.subject} (${best.rate}%). Lowest: ${worst.subject} (${worst.rate}%).`);
    }
    highlights.push(`${new Set(low.map((item) => item.id)).size} student(s) are below the ${threshold}% target.`);
    if (perfect.length > 0) highlights.push(`${perfect.length} student(s) never missed or were late for a class.`);
  }

  return {
    title: 'Attendance Report',
    subtitle: `${className} - sessions held and attendance`,
    orientation: 'portrait',
    filters: [
      { label: 'Class', value: className },
      { label: 'Attendance target', value: `${threshold}%` },
    ],
    summary: [
      kpi('Sessions held', num(totals.sessions)),
      kpi('Marks recorded', marks),
      kpi('Present', present, 'number', { tone: 'success' }),
      kpi('Late', late, 'number', { tone: 'warning' }),
      kpi('Absent', absent, 'number', { tone: 'danger' }),
      kpi('Attendance rate', rate, 'percent', { tone: rate !== null && rate < threshold ? 'warning' : 'success' }),
    ],
    highlights,
    sections: [
      section('Attendance over time', [
        columnChart(
          weekly ? 'Attendance rate by week (week starting)' : 'Attendance rate by month',
          trend.map((item) => ({
            label: weekly ? parts.formatDate(item.bucket).slice(0, 6) : parts.monthLabel(item.bucket),
            value: percent(item.attended, item.marks) || 0,
          })),
          'percent'
        ),
      ]),
      section('Attendance by class', [
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'tutor', label: 'Tutor' },
            { key: 'sessions', label: 'Sessions', format: 'number' },
            { key: 'present', label: 'Present', format: 'number' },
            { key: 'late', label: 'Late', format: 'number' },
            { key: 'absent', label: 'Absent', format: 'number' },
            { key: 'rate', label: 'Rate', format: 'percent' },
          ],
          classRows,
          { totals: ['sessions', 'present', 'late', 'absent'], emptyText: 'No sessions were held in this period.' }
        ),
        bars(
          'Attendance rate by class',
          classRows.filter((item) => item.rate !== null).map((item) => ({ label: item.subject, value: item.rate })),
          'percent',
          { max: 100 }
        ),
      ], { intro: 'Rate = present or late, out of all attendance marks. Lowest rates are listed first.' }),
      section(`Students below ${threshold}%`, [
        table(
          [
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'grade', label: 'Grade', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'attended', label: 'Attended', format: 'number' },
            { key: 'marks', label: 'Sessions', format: 'number' },
            { key: 'rate', label: 'Rate', format: 'percent' },
          ],
          low,
          { emptyText: `Every student met the ${threshold}% target.` }
        ),
        perfect.length > 0
          ? table(
            [
              { key: 'student_code', label: 'Code', width: 'auto' },
              { key: 'full_name', label: 'Student' },
              { key: 'marks', label: 'Sessions attended', format: 'number' },
            ],
            perfect,
            { title: 'Full attendance (present at every session)' }
          )
          : null,
      ]),
      section('Session log', [
        table(
          [
            { key: 'session_date', label: 'Date', format: 'date', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'present', label: 'Present', format: 'number' },
            { key: 'late', label: 'Late', format: 'number' },
            { key: 'absent', label: 'Absent', format: 'number' },
            { key: 'rate', label: 'Rate', format: 'percent' },
          ],
          sessions.map((item) => ({ ...item, rate: percent(num(item.present) + num(item.late), item.marks) })),
          { emptyText: 'No sessions in this period.' }
        ),
      ]),
    ],
  };
}

module.exports = { code: 'ATT', build };
