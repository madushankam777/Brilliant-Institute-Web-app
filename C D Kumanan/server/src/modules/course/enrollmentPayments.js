// unpaid enrolments - pay at least 1 day before the first class, a warning the day before that, then the place is released
const { pool } = require('../../../../../shared/server/src/config/db');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { createNotification } = require('../../../../../shared/server/src/utils/notifications');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');

const HOUR_MS = 60 * 60 * 1000;
// the first class must be at least this far after enrolment, so there is always time to pay
const MIN_LEAD_MS = 48 * HOUR_MS;
// the place is released this long before the first class
const RELEASE_BEFORE_CLASS_MS = 24 * HOUR_MS;
// the warning goes out this long before the place is released
const WARN_BEFORE_RELEASE_MS = 24 * HOUR_MS;
// how often the check runs
const CHECK_EVERY_MS = 15 * 60 * 1000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// a Date as 'YYYY-MM-DD HH:MM:SS' in this server's own time zone (what MySQL stores)
function toMysql(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// a time like "Mon 12 Oct, 3:30 PM" for messages
function friendly(date) {
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// money as "LKR 2,500.00"
function lkr(amount) {
  return `LKR ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// the pay-by time: 1 day before the first class that is at least 2 days away
function paymentDueFor(classRow, enrolledAt = new Date()) {
  const weekday = WEEKDAYS.indexOf(classRow.day_of_week);
  if (weekday < 0) return null;
  const [hours, minutes] = String(classRow.start_time || '00:00').split(':').map(Number);

  // start from the class start date if it is later than today
  const from = new Date(enrolledAt.getTime() + MIN_LEAD_MS);
  if (classRow.start_date) {
    const start = new Date(`${String(classRow.start_date).slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && start > from) from.setTime(start.getTime());
  }

  // walk forward to the class weekday, at the class time
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours || 0, minutes || 0, 0, 0);
  while (first.getDay() !== weekday || first.getTime() < from.getTime()) {
    first.setDate(first.getDate() + 1);
    first.setHours(hours || 0, minutes || 0, 0, 0);
  }
  return new Date(first.getTime() - RELEASE_BEFORE_CLASS_MS);
}

// right after enrolling - save the pay-by time and send the urgent payment notice
async function startPaymentDeadline({ enrollmentId, studentId, classRow }) {
  if (Number(classRow.fee) <= 0 || !(await schema.hasPaymentDeadlines())) return null;

  const dueAt = paymentDueFor(classRow);
  if (!dueAt) return null;
  await pool.execute(
    `UPDATE enrollments SET payment_due_at = ?, payment_warned_at = NULL WHERE id = ?`,
    [toMysql(dueAt), enrollmentId]
  );

  await createNotification({
    recipientId: studentId,
    type: 'PAYMENT_DUE',
    message:
      `Payment needed: pay ${lkr(classRow.fee)} for ${classRow.subject} by ${friendly(dueAt)} ` +
      'to keep your place. Unpaid places are released to students on the waiting list.',
    link: `/payments?enrollment=${enrollmentId}`,
  });
  return dueAt;
}

// unpaid enrolments with a pay-by time - nothing paid and no bank slip waiting
async function listUnpaidWithDeadline() {
  const [rows] = await pool.execute(
    `SELECT e.id, e.student_id, e.class_id, e.balance, e.payment_due_at, e.payment_warned_at,
            c.subject, c.tutor_id, u.full_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = e.student_id
     WHERE e.status = 'ACTIVE' AND e.payment_status = 'UNPAID' AND e.balance > 0
       AND e.payment_due_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM payments p
         WHERE p.enrollment_id = e.id AND p.status IN ('SUCCESSFUL', 'PENDING')
       )`
  );
  return rows;
}

// 2 days before the class - the pop-up warning
async function warnStudent(row) {
  const dueAt = new Date(row.payment_due_at);
  // marked first, so a slow email never sends the warning twice
  await pool.execute(`UPDATE enrollments SET payment_warned_at = NOW() WHERE id = ?`, [row.id]);
  await createNotification({
    recipientId: row.student_id,
    type: 'ENROLMENT_AT_RISK',
    message:
      `Your place in ${row.subject} will be released on ${friendly(dueAt)} because it is not paid yet. ` +
      `Pay ${lkr(row.balance)} now to keep it.`,
    link: `/payments?enrollment=${row.id}`,
  });
}

// the pay-by time has passed - release the place (the record stays, marked dropped)
async function releaseSeat(row) {
  const [result] = await pool.execute(
    `UPDATE enrollments SET status = 'DROPPED', drop_date = NOW()
     WHERE id = ? AND status = 'ACTIVE' AND payment_status = 'UNPAID'`,
    [row.id]
  );
  if (result.affectedRows === 0) return false;

  await createNotification({
    recipientId: row.student_id,
    type: 'ENROLMENT_RELEASED',
    message:
      `Your place in ${row.subject} was released because it was not paid in time. ` +
      'You can enrol again if seats are still free.',
    link: `/courses/my-courses?highlight=${row.id}`,
  });
  // the tutor sees the seat is free again
  await createNotification({
    recipientId: row.tutor_id,
    type: 'STUDENT_LEFT',
    message: `${row.full_name}'s place in ${row.subject} was released because it was not paid in time.`,
    link: '/students/mine',
  });
  await recordAuditEvent({
    actorId: null,
    action: 'ENROLMENT_RELEASED_UNPAID',
    entityType: 'enrollment',
    entityId: row.id,
    details: { classId: row.class_id, studentId: row.student_id },
  });
  return true;
}

// tried to join a full class - remember them for when a seat frees up
async function joinWaitlist(studentId, classId) {
  if (!(await schema.hasClassWaitlist())) return false;
  await pool.execute(
    `INSERT INTO class_waitlist (class_id, student_id, created_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [classId, studentId]
  );
  return true;
}

// enrolled now - no longer waiting
async function leaveWaitlist(studentId, classId) {
  if (!(await schema.hasClassWaitlist())) return;
  await pool.execute(`DELETE FROM class_waitlist WHERE class_id = ? AND student_id = ?`, [classId, studentId]);
}

// a seat freed up - tell everyone waiting how many seats are left
async function notifyWaitlist(classId) {
  if (!(await schema.hasClassWaitlist())) return 0;

  const [classes] = await pool.execute(
    `SELECT c.id, c.subject, c.capacity, c.status,
            (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS taken
     FROM classes c WHERE c.id = ?`,
    [classId]
  );
  const classRow = classes[0];
  if (!classRow || classRow.status !== 'ACTIVE') return 0;
  const free = Number(classRow.capacity) - Number(classRow.taken);
  if (free <= 0) return 0;

  // waiting students who are not in the class already
  const [waiting] = await pool.execute(
    `SELECT w.student_id
     FROM class_waitlist w
     JOIN users u ON u.id = w.student_id AND u.status = 'ACTIVE'
     WHERE w.class_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.class_id = w.class_id AND e.student_id = w.student_id AND e.status = 'ACTIVE'
       )`,
    [classId]
  );

  const seats = `${free} seat${free === 1 ? '' : 's'}`;
  for (const student of waiting) {
    await createNotification({
      recipientId: student.student_id,
      type: 'SEAT_AVAILABLE',
      message:
        `Good news - ${classRow.subject} now has ${seats} free. You joined its waiting list, so you can ` +
        'enrol now. Places go to whoever enrols first.',
      link: `/courses/classes/${classId}`,
    });
  }
  if (waiting.length > 0) {
    await pool.execute(`UPDATE class_waitlist SET notified_at = NOW() WHERE class_id = ?`, [classId]);
  }
  return waiting.length;
}

// the class was cancelled - tell the waiting students and empty its waiting list
async function closeWaitlist(classId, subject) {
  if (!(await schema.hasClassWaitlist())) return 0;
  const [waiting] = await pool.execute(`SELECT student_id FROM class_waitlist WHERE class_id = ?`, [classId]);
  for (const row of waiting) {
    await createNotification({
      recipientId: row.student_id,
      type: 'CLASS_CANCELLED',
      message: `${subject} was cancelled, so its waiting list is closed. Browse the other classes to find another one.`,
      link: '/courses/classes',
    });
  }
  await pool.execute(`DELETE FROM class_waitlist WHERE class_id = ?`, [classId]);
  return waiting.length;
}

// the regular check - warn first, release after the pay-by time, then tell the waiting list
async function runPaymentDeadlineCheck(now = new Date()) {
  if (!(await schema.hasPaymentDeadlines())) return { warned: 0, released: 0 };

  let warned = 0;
  let released = 0;
  const freedClasses = new Set();
  for (const row of await listUnpaidWithDeadline()) {
    const dueAt = new Date(row.payment_due_at).getTime();
    if (now.getTime() >= dueAt) {
      if (await releaseSeat(row)) {
        released += 1;
        freedClasses.add(row.class_id);
      }
    } else if (!row.payment_warned_at && now.getTime() >= dueAt - WARN_BEFORE_RELEASE_MS) {
      await warnStudent(row);
      warned += 1;
    }
  }
  for (const classId of freedClasses) {
    await notifyWaitlist(classId);
  }
  return { warned, released };
}

// starts the check shortly after start-up, then every 15 minutes
let timer = null;
function startPaymentDeadlineScheduler() {
  if (timer) return;
  const run = () =>
    runPaymentDeadlineCheck().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[enrolments] payment deadline check failed:', error.message);
    });
  setTimeout(run, 20 * 1000).unref();
  timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
}

module.exports = {
  paymentDueFor,
  startPaymentDeadline,
  runPaymentDeadlineCheck,
  startPaymentDeadlineScheduler,
  joinWaitlist,
  leaveWaitlist,
  notifyWaitlist,
  closeWaitlist,
};
