// queries shared by several reports
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { rows, num } = require('./reportParts');

// lookup map from a list of rows
function byId(list, key = 'id') {
  const map = new Map();
  list.forEach((item) => map.set(item[key], item));
  return map;
}

// every class with its tutor and active enrolment count
async function getClasses({ classId, tutorId } = {}) {
  const where = [];
  const params = [];
  if (classId) {
    where.push('c.id = ?');
    params.push(classId);
  }
  if (tutorId) {
    where.push('c.tutor_id = ?');
    params.push(tutorId);
  }
  const startDate = (await schema.hasClassStartDate()) ? 'c.start_date' : 'NULL';
  const list = await rows(
    `SELECT c.id, c.subject, c.subject_area, c.level, c.tutor_id, c.venue, c.day_of_week, c.start_time, c.end_time,
            ${startDate} AS start_date, c.capacity, c.fee, c.status, c.created_at, u.full_name AS tutor_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled
     FROM classes c
     JOIN users u ON u.id = c.tutor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.status ASC, c.subject ASC`,
    params
  );
  return list.map((item) => ({ ...item, capacity: num(item.capacity), fee: num(item.fee), enrolled: num(item.enrolled) }));
}

// fees collected per class in the period
async function getCollectionsByClass(period) {
  const list = await rows(
    `SELECT e.class_id, COUNT(*) AS payments, SUM(p.amount) AS collected
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.status = 'SUCCESSFUL' AND p.paid_at >= ? AND p.paid_at < ?
     GROUP BY e.class_id`,
    [period.start, period.end]
  );
  const map = new Map();
  list.forEach((item) => map.set(item.class_id, { payments: num(item.payments), collected: num(item.collected) }));
  return map;
}

// unpaid balances per class (right now)
async function getOutstandingByClass() {
  const list = await rows(
    `SELECT class_id, COUNT(*) AS students, SUM(balance) AS owed
     FROM enrollments
     WHERE status = 'ACTIVE' AND balance > 0
     GROUP BY class_id`
  );
  const map = new Map();
  list.forEach((item) => map.set(item.class_id, { students: num(item.students), owed: num(item.owed) }));
  return map;
}

// sessions and attendance marks per class in the period
async function getAttendanceByClass(period) {
  const list = await rows(
    `SELECT cs.class_id, COUNT(DISTINCT cs.id) AS sessions, COUNT(ar.id) AS marks,
            SUM(ar.status = 'PRESENT') AS present, SUM(ar.status = 'LATE') AS late, SUM(ar.status = 'ABSENT') AS absent
     FROM class_sessions cs
     LEFT JOIN attendance_records ar ON ar.session_id = cs.id
     WHERE cs.session_date BETWEEN ? AND ?
     GROUP BY cs.class_id`,
    [period.from, period.to]
  );
  const map = new Map();
  list.forEach((item) => {
    const present = num(item.present);
    const late = num(item.late);
    const marks = num(item.marks);
    map.set(item.class_id, {
      sessions: num(item.sessions),
      marks,
      present,
      late,
      absent: num(item.absent),
      rate: marks ? Math.round(((present + late) / marks) * 1000) / 10 : null,
    });
  });
  return map;
}

// attendance per student in the period
async function getAttendanceByStudent(period) {
  const list = await rows(
    `SELECT ar.student_id, COUNT(*) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     WHERE cs.session_date BETWEEN ? AND ?
     GROUP BY ar.student_id`,
    [period.from, period.to]
  );
  const map = new Map();
  list.forEach((item) => {
    const marks = num(item.marks);
    const attended = num(item.attended);
    map.set(item.student_id, { marks, attended, rate: marks ? Math.round((attended / marks) * 1000) / 10 : null });
  });
  return map;
}

// students under the attendance threshold (per class, at least 3 marks)
async function getLowAttendance(period, threshold, classId = null) {
  const params = [period.from, period.to];
  let classFilter = '';
  if (classId) {
    classFilter = 'AND c.id = ?';
    params.push(classId);
  }
  params.push(threshold);
  const list = await rows(
    `SELECT u.id, u.full_name, u.student_code, u.grade, u.phone, c.subject,
            COUNT(*) AS marks, SUM(ar.status IN ('PRESENT', 'LATE')) AS attended
     FROM attendance_records ar
     JOIN class_sessions cs ON cs.id = ar.session_id
     JOIN classes c ON c.id = cs.class_id
     JOIN users u ON u.id = ar.student_id
     WHERE cs.session_date BETWEEN ? AND ? ${classFilter}
     GROUP BY u.id, c.id, u.full_name, u.student_code, u.grade, u.phone, c.subject
     HAVING marks >= 3 AND (attended / marks) * 100 < ?
     ORDER BY (attended / marks) ASC, u.full_name ASC`,
    params
  );
  return list.map((item) => ({
    ...item,
    marks: num(item.marks),
    attended: num(item.attended),
    rate: Math.round((num(item.attended) / num(item.marks)) * 1000) / 10,
  }));
}

// tutor payouts in the period (works before and after the payout tracking update)
async function getPayouts(period, tutorId = null) {
  const tracking = await schema.hasPayoutTracking();
  const params = [period.start, period.end];
  let tutorFilter = '';
  if (tutorId) {
    tutorFilter = 'AND tp.tutor_id = ?';
    params.push(tutorId);
  }
  const extra = tracking
    ? 'tp.status, tp.method, tp.bank_name, tp.bank_account_last4, tp.provider_reference, tp.failure_reason, tp.settled_at'
    : "'RECORDED' AS status, 'MANUAL' AS method, NULL AS bank_name, NULL AS bank_account_last4, NULL AS provider_reference, NULL AS failure_reason, NULL AS settled_at";
  const list = await rows(
    `SELECT tp.id, tp.tutor_id, t.full_name AS tutor_name, tp.amount, tp.note, tp.period_label, tp.paid_at,
            a.full_name AS paid_by_name, ${extra}
     FROM tutor_payouts tp
     JOIN users t ON t.id = tp.tutor_id
     LEFT JOIN users a ON a.id = tp.paid_by
     WHERE tp.paid_at >= ? AND tp.paid_at < ? ${tutorFilter}
     ORDER BY tp.paid_at ASC`,
    params
  );
  return list.map((item) => ({ ...item, amount: num(item.amount), account: accountText(item) }));
}

// bank name with the last 4 digits of the account
function accountText(payout) {
  if (!payout.bank_name && !payout.bank_account_last4) return '-';
  return `${payout.bank_name || 'Account'}${payout.bank_account_last4 ? ` ••••${payout.bank_account_last4}` : ''}`;
}

// a payout counts as paid once it is sent (or was recorded before tracking existed)
function isPaid(payout) {
  return payout.status === 'SENT' || payout.status === 'RECORDED';
}

// payouts that still need action (any date)
async function getUnsettledPayouts(tutorId = null) {
  if (!(await schema.hasPayoutTracking())) return [];
  const params = [];
  let tutorFilter = '';
  if (tutorId) {
    tutorFilter = 'AND tp.tutor_id = ?';
    params.push(tutorId);
  }
  const list = await rows(
    `SELECT tp.id, tp.tutor_id, tp.amount, tp.status
     FROM tutor_payouts tp
     WHERE tp.status IN ('QUEUED', 'FAILED') ${tutorFilter}`,
    params
  );
  return list.map((item) => ({ ...item, amount: num(item.amount) }));
}

// collections total for a period
async function getCollectedTotal(range) {
  const [row] = await rows(
    `SELECT COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS total
     FROM payments
     WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?`,
    [range.start, range.end]
  );
  return { payments: num(row.payments), total: num(row.total) };
}

// monthly collections between two dates, with empty months filled in
async function getMonthlyCollections(fromKey, toKey, monthKeys) {
  const list = await rows(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(amount) AS total
     FROM payments
     WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY month`,
    [`${fromKey} 00:00:00`, `${toKey} 00:00:00`]
  );
  const totals = new Map(list.map((item) => [item.month, num(item.total)]));
  return monthKeys.map((key) => ({ key, total: totals.get(key) || 0 }));
}

module.exports = {
  byId,
  getClasses,
  getCollectionsByClass,
  getOutstandingByClass,
  getAttendanceByClass,
  getAttendanceByStudent,
  getLowAttendance,
  getPayouts,
  getUnsettledPayouts,
  isPaid,
  getCollectedTotal,
  getMonthlyCollections,
};
