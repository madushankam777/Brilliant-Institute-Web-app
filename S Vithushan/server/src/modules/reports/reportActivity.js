// what a person did on the site, from the audit log, in plain words
const { pool } = require('../../../../../shared/server/src/config/db');
const { rows, formatDate, formatTime, money, label, facts, bars, table } = require('./reportParts');

// friendly names for recorded actions
const ACTIONS = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Wrong password',
  USER_REGISTERED: 'Registered',
  TUTOR_REGISTERED: 'Registered as tutor',
  USER_CREATED_BY_ADMIN: 'Account created by admin',
  USER_SUSPENDED: 'Account suspended',
  USER_ACTIVATED: 'Account reactivated',
  USER_DELETED: 'Account deleted',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET_REQUESTED: 'Reset code requested',
  PASSWORD_RESET_COMPLETED: 'Password reset',
  PASSWORD_RESET_LINK_ISSUED: 'Reset link made by admin',
  PROFILE_UPDATED: 'Profile updated',
  PROFILE_PICTURE_UPDATED: 'Profile picture changed',
  PROFILE_PICTURE_REMOVED: 'Profile picture removed',
  PAYMENT_SUCCESSFUL: 'Payment made',
  PAYMENT_FAILED: 'Payment failed',
  PAYMENT_CHECKOUT_STARTED: 'Online payment started',
  PAYMENT_GATEWAY_ERROR: 'Payment error',
  PAYMENT_RECORDED_BY_ADMIN: 'Office payment recorded',
  BANK_TRANSFER_SUBMITTED: 'Bank slip uploaded',
  BANK_TRANSFER_EDITED: 'Bank slip edited',
  BANK_TRANSFER_APPROVED: 'Bank slip approved',
  BANK_TRANSFER_REJECTED: 'Bank slip rejected',
  PAYMENT_SETTINGS_UPDATED: 'Payment settings changed',
  TUTOR_PAID: 'Tutor paid',
  PAYOUT_SETTLED: 'Payout confirmed',
  PAYOUT_FAILED: 'Payout failed',
  PAYOUT_FILE_EXPORTED: 'Payout file exported',
  TUTOR_BANK_DETAILS_VIEWED: 'Bank details viewed',
  TUTOR_BANK_DETAILS_UPDATED: 'Bank details changed',
  TUTOR_BANK_DETAILS_UPDATED_BY_ADMIN: 'Bank details changed by admin',
  TUTOR_KEY_GENERATED: 'Tutor key issued',
  TUTOR_KEY_REVOKED: 'Tutor key revoked',
  TUTOR_KEY_DELETED: 'Tutor key deleted',
  CLASS_CREATED: 'Class created',
  CLASS_UPDATED: 'Class updated',
  CLASS_CANCELLED: 'Class cancelled',
  CLASS_DAY_CANCELLED: 'Class day cancelled',
  CLASS_DAY_RESTORED: 'Class day restored',
  EXTRA_CLASS_ADDED: 'Extra class added',
  EXTRA_CLASS_REMOVED: 'Extra class removed',
  CLASS_ENROLLED: 'Enrolled',
  CLASS_DROPPED: 'Dropped a class',
  CLASS_ENROLLMENT_REMOVED: 'Old class removed',
  ATTENDANCE_CHECKIN_OPENED: 'Check-in opened',
  ATTENDANCE_CODE_CHECKIN: 'Checked in',
  ATTENDANCE_MARKED: 'Attendance marked',
  ATTENDANCE_CORRECTED: 'Attendance corrected',
  ANNOUNCEMENT_PUBLISHED: 'Announcement published',
  ANNOUNCEMENT_UPDATED: 'Announcement edited',
  ANNOUNCEMENT_REMOVED: 'Announcement removed',
  REMINDERS_SENT: 'Reminders sent',
  TUTOR_MESSAGE_SENT: 'Message sent',
  REMINDER_SCHEDULED: 'Reminder scheduled',
  REMINDER_CANCELLED: 'Reminder cancelled',
  FEEDBACK_SUBMITTED: 'Feedback sent',
  FEEDBACK_REPLIED: 'Feedback reply',
  FEEDBACK_RESOLVED: 'Feedback resolved',
  CONTACT_MESSAGE_HANDLED: 'Enquiry answered',
  CONTACT_MESSAGE_REOPENED: 'Enquiry reopened',
  REREGISTRATION_KEYS_ISSUED: 'Re-registration keys issued',
  REREGISTRATION_KEY_REVOKED: 'Re-registration key revoked',
  REREGISTRATION_KEY_DELETED: 'Re-registration key deleted',
  REREGISTRATION_COMPLETED: 'Re-registered',
  YEARLY_ROLLOVER_RUN: 'Yearly roll-over run',
  REPORT_GENERATED: 'Report viewed',
  REPORT_DOWNLOADED: 'Report downloaded',
  REPORT_HISTORY_REMOVED: 'Recent reports deleted',
};

// which part of the site an action belongs to
const AREAS = {
  LOGIN_SUCCESS: 'Sign-in',
  LOGIN_FAILED: 'Sign-in',
  ATTENDANCE_CHECKIN_OPENED: 'Attendance',
  ATTENDANCE_CODE_CHECKIN: 'Attendance',
  ATTENDANCE_MARKED: 'Attendance',
  ATTENDANCE_CORRECTED: 'Attendance',
  PAYMENT_SUCCESSFUL: 'Payments',
  PAYMENT_FAILED: 'Payments',
  PAYMENT_CHECKOUT_STARTED: 'Payments',
  PAYMENT_GATEWAY_ERROR: 'Payments',
  BANK_TRANSFER_SUBMITTED: 'Payments',
  BANK_TRANSFER_EDITED: 'Payments',
  FEEDBACK_SUBMITTED: 'Feedback',
  FEEDBACK_REPLIED: 'Feedback',
  FEEDBACK_RESOLVED: 'Feedback',
  TUTOR_MESSAGE_SENT: 'Messages',
  REMINDER_SCHEDULED: 'Messages',
  REMINDER_CANCELLED: 'Messages',
  REREGISTRATION_COMPLETED: 'Re-registration',
};

// the friendly name of an action, or the action itself if it has none
function actionName(action) {
  return ACTIONS[action] || label(action);
}

// which part of the site an action belongs to
function areaOf(action) {
  if (AREAS[action]) return AREAS[action];
  if (action.startsWith('CLASS_') || action.startsWith('EXTRA_CLASS')) return 'Classes';
  if (action.startsWith('PASSWORD_') || action.startsWith('PROFILE_') || action.endsWith('REGISTERED') || action.includes('BANK_DETAILS')) {
    return 'Account';
  }
  return 'Other';
}

// details are saved as JSON text - turn them back into an object
function parseDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

// rows by id for a set of ids
async function lookup(sql, idSet) {
  const ids = [...idSet].filter(Boolean);
  if (ids.length === 0) return new Map();
  const [list] = await pool.query(sql, [ids]);
  return new Map(list.map((item) => [item.id, item]));
}

// names of the classes, payments, tickets... that the actions point at
async function loadNames(events) {
  const ids = {
    class_session: new Set(),
    class: new Set(),
    payment: new Set(),
    enrollment: new Set(),
    feedback_complaint: new Set(),
    attendance_record: new Set(),
    tutor_payout: new Set(),
    user: new Set(),
  };
  events.forEach((event) => {
    if (ids[event.entity_type] && event.entity_id) ids[event.entity_type].add(event.entity_id);
    const details = parseDetails(event.details);
    if (details.classId) ids.class.add(Number(details.classId));
  });
  return {
    sessions: await lookup(
      `SELECT cs.id, cs.session_date, c.subject FROM class_sessions cs JOIN classes c ON c.id = cs.class_id WHERE cs.id IN (?)`,
      ids.class_session
    ),
    classes: await lookup('SELECT id, subject FROM classes WHERE id IN (?)', ids.class),
    payments: await lookup(
      `SELECT p.id, p.amount, c.subject, r.receipt_number
       FROM payments p JOIN enrollments e ON e.id = p.enrollment_id JOIN classes c ON c.id = e.class_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       WHERE p.id IN (?)`,
      ids.payment
    ),
    enrolments: await lookup(
      'SELECT e.id, c.subject FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.id IN (?)',
      ids.enrollment
    ),
    tickets: await lookup('SELECT id, ticket_number, subject FROM feedback_complaints WHERE id IN (?)', ids.feedback_complaint),
    marks: await lookup(
      `SELECT ar.id, cs.session_date, c.subject, u.full_name AS student
       FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id
       JOIN classes c ON c.id = cs.class_id JOIN users u ON u.id = ar.student_id
       WHERE ar.id IN (?)`,
      ids.attendance_record
    ),
    payouts: await lookup('SELECT id, amount, period_label FROM tutor_payouts WHERE id IN (?)', ids.tutor_payout),
    users: await lookup('SELECT id, full_name FROM users WHERE id IN (?)', ids.user),
  };
}

// "12 students", "the office", "12 students and the office"
function recipientsText(details) {
  if (details.audience === 'ADMIN') return 'the office';
  const count = details.recipientCount ? `${details.recipientCount} ` : '';
  return details.audience === 'BOTH' ? `${count}students and the office` : `${count}students`;
}

// one sentence for an action - "self" = the person did it, "staff" = done to their account
function describe(event, names, view = 'self') {
  const details = parseDetails(event.details);
  const id = event.entity_id;
  const session = names.sessions.get(id);
  const sessionText = session ? `${session.subject} on ${formatDate(session.session_date)}` : 'a class session';
  const payment = names.payments.get(id);
  // " - LKR 2,500.00 for English (receipt ...)" or nothing when the payment was deleted
  const paymentText = payment
    ? ` - LKR ${money(payment.amount)} for ${payment.subject}${payment.receipt_number ? ` (receipt ${payment.receipt_number})` : ''}`
    : '';
  const classId = details.classId ? Number(details.classId) : event.entity_type === 'class' ? id : null;
  const className = names.classes.get(classId)?.subject || 'a class';
  const enrolment = names.enrolments.get(id);
  const ticket = names.tickets.get(id);
  const ticketText = ticket ? `ticket ${ticket.ticket_number} "${ticket.subject}"` : 'a feedback ticket';
  const payout = names.payouts.get(id);
  const target = names.users.get(id)?.full_name || 'a user';
  const account = view === 'staff' ? 'this account' : `${target}'s account`;

  switch (event.action) {
    case 'LOGIN_SUCCESS':
      return 'Signed in to the site';
    case 'LOGIN_FAILED':
      return 'Typed a wrong password';
    case 'USER_REGISTERED':
    case 'TUTOR_REGISTERED':
      return 'Created their account';
    case 'PROFILE_UPDATED':
      return 'Updated their profile details';
    case 'PROFILE_PICTURE_UPDATED':
      return 'Changed their profile picture';
    case 'PROFILE_PICTURE_REMOVED':
      return 'Removed their profile picture';
    case 'PASSWORD_CHANGED':
      return 'Changed their password';
    case 'PASSWORD_RESET_REQUESTED':
      return 'Asked for a password reset code by email';
    case 'PASSWORD_RESET_COMPLETED':
      return details.method === 'email code' ? 'Reset their password with an emailed code' : 'Reset their password';
    case 'TUTOR_BANK_DETAILS_UPDATED':
      return 'Updated their payout bank details';
    case 'CLASS_ENROLLED':
      return `Enrolled in ${className}`;
    case 'CLASS_DROPPED':
      return `Dropped ${enrolment ? enrolment.subject : 'a class'}`;
    case 'CLASS_ENROLLMENT_REMOVED':
      return 'Removed a dropped class from their history';
    case 'CLASS_CREATED':
      return `Created the class ${className}`;
    case 'CLASS_UPDATED':
      return Array.isArray(details.changes) && details.changes.length > 0
        ? `Changed ${className}: ${details.changes.join('; ')}`
        : `Updated ${className}`;
    case 'CLASS_CANCELLED':
      return `Cancelled the class ${className}`;
    case 'CLASS_DAY_CANCELLED':
      return `Cancelled ${className} on ${formatDate(details.date)}`;
    case 'CLASS_DAY_RESTORED':
      return `Brought back ${className} on ${formatDate(details.date)}`;
    case 'EXTRA_CLASS_ADDED':
      return `Added an extra ${className} class on ${formatDate(details.date)}` +
        (details.startTime ? `, ${formatTime(details.startTime)} - ${formatTime(details.endTime)}` : '') +
        (details.venue ? ` at ${details.venue}` : '');
    case 'EXTRA_CLASS_REMOVED':
      return `Removed the extra ${className} class on ${formatDate(details.date)}`;
    case 'ATTENDANCE_CHECKIN_OPENED':
      return `Opened the check-in code for ${sessionText}`;
    case 'ATTENDANCE_CODE_CHECKIN':
      return `Checked in to ${sessionText} with the class code`;
    case 'ATTENDANCE_MARKED': {
      const count = (Number(details.createdCount) || 0) + (Number(details.updatedCount) || 0);
      return `Marked attendance for ${sessionText}${count ? ` (${count} student${count === 1 ? '' : 's'})` : ''}`;
    }
    case 'ATTENDANCE_CORRECTED': {
      const mark = names.marks.get(id);
      const who = mark ? `${mark.student} in ${mark.subject} on ${formatDate(mark.session_date)}` : 'a student';
      return `Changed the mark for ${who} from ${label(details.previousStatus)} to ${label(details.newStatus)}`;
    }
    case 'PAYMENT_SUCCESSFUL':
      return `Made a payment${paymentText}`;
    case 'PAYMENT_FAILED':
      return `A payment did not go through${paymentText}${details.reason ? ` (${details.reason})` : ''}`;
    case 'PAYMENT_CHECKOUT_STARTED':
      return `Started an online card payment${details.amount ? ` of LKR ${money(details.amount)}` : ''}`;
    case 'PAYMENT_GATEWAY_ERROR':
      return 'The payment service could not be reached';
    case 'BANK_TRANSFER_SUBMITTED':
      return `Uploaded a bank transfer slip${paymentText}`;
    case 'BANK_TRANSFER_EDITED':
      return `Edited a bank transfer slip${paymentText}`;
    case 'BANK_TRANSFER_APPROVED':
      return `Approved a bank transfer slip${paymentText}`;
    case 'BANK_TRANSFER_REJECTED':
      return `Rejected a bank transfer slip${paymentText}`;
    case 'PAYMENT_RECORDED_BY_ADMIN':
      return `Recorded an office payment${paymentText}`;
    case 'TUTOR_PAID':
      return `Recorded a payout of LKR ${money(details.amount || (payout && payout.amount))}${payout && payout.period_label ? ` for ${payout.period_label}` : ''}` +
        (details.bankReference ? ` (bank reference ${details.bankReference})` : '');
    case 'PAYOUT_SETTLED':
      return `Confirmed a payout transfer${details.providerReference ? ` (reference ${details.providerReference})` : ''}`;
    case 'PAYOUT_FAILED':
      return `Marked a payout as failed${details.reason ? `: ${details.reason}` : ''}`;
    case 'TUTOR_BANK_DETAILS_VIEWED':
      return view === 'staff' ? 'Viewed the full payout account number to make a transfer' : `Viewed ${target}'s full payout account number`;
    case 'TUTOR_BANK_DETAILS_UPDATED_BY_ADMIN':
      return view === 'staff' ? 'Changed the payout bank details' : `Changed ${target}'s payout bank details`;
    case 'USER_SUSPENDED':
      return `Suspended ${account}`;
    case 'USER_ACTIVATED':
      return `Reactivated ${account}`;
    case 'USER_DELETED':
      return `Deleted ${account}`;
    case 'USER_CREATED_BY_ADMIN':
      return view === 'staff' ? 'Created this account' : `Created an account for ${target}`;
    case 'PASSWORD_RESET_LINK_ISSUED':
      return `Made a password reset link for ${view === 'staff' ? 'this account' : target}`;
    case 'TUTOR_MESSAGE_SENT':
      return `Sent a message to ${recipientsText(details)}${details.classId ? ` in ${className}` : ''}`;
    case 'REMINDER_SCHEDULED': {
      const when = details.sendAt ? ` to go out on ${formatDate(details.sendAt)} at ${formatTime(String(details.sendAt).slice(11, 16))}` : '';
      return `Scheduled a reminder for ${recipientsText(details)}${when}`;
    }
    case 'REMINDER_CANCELLED':
      return 'Cancelled a scheduled reminder';
    case 'FEEDBACK_SUBMITTED':
      return `Sent ${ticketText}${details.category ? ` about "${details.category}"` : ''}`;
    case 'FEEDBACK_REPLIED':
      return `Replied on ${ticketText}`;
    case 'FEEDBACK_RESOLVED':
      return `Marked ${ticketText} as resolved`;
    case 'REREGISTRATION_COMPLETED':
      return `Re-registered for ${details.academicYear || 'next year'}${details.toGrade ? `, moving to ${details.toGrade}` : ''}`;
    case 'REPORT_GENERATED':
    case 'REPORT_DOWNLOADED':
      return `${event.action === 'REPORT_DOWNLOADED' ? 'Downloaded' : 'Viewed'} the ${details.title || 'report'}`;
    default:
      return actionName(event.action);
  }
}

// everything this person did in the period, oldest first
async function getActivity(userId, period) {
  const events = await rows(
    `SELECT id, action, entity_type, entity_id, details, created_at
     FROM audit_log
     WHERE actor_id = ? AND created_at >= ? AND created_at < ?
     ORDER BY created_at ASC, id ASC`,
    [userId, period.start, period.end]
  );
  const names = await loadNames(events);
  return events.map((event) => ({
    created_at: event.created_at,
    action: event.action,
    area: areaOf(event.action),
    what: actionName(event.action),
    detail: describe(event, names, 'self'),
  }));
}

// what staff did to this person's account, payments or payouts
async function getStaffActions(userId, period) {
  const events = await rows(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.full_name AS by_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.created_at >= ? AND a.created_at < ? AND (a.actor_id IS NULL OR a.actor_id <> ?)
       AND ((a.entity_type = 'user' AND a.entity_id = ?)
         OR (a.entity_type = 'payment' AND a.entity_id IN (SELECT id FROM payments WHERE student_id = ?))
         OR (a.entity_type = 'tutor_payout' AND a.entity_id IN (SELECT id FROM tutor_payouts WHERE tutor_id = ?)))
     ORDER BY a.created_at ASC, a.id ASC`,
    [period.start, period.end, userId, userId, userId, userId]
  );
  const names = await loadNames(events);
  return events.map((event) => ({
    created_at: event.created_at,
    by: event.by_name || 'System',
    what: actionName(event.action),
    detail: describe(event, names, 'staff'),
  }));
}

// "Activity on the site" blocks for one person's report
function activityBlocks(activity, staffActions) {
  const signIns = activity.filter((item) => item.action === 'LOGIN_SUCCESS').length;
  const wrongPasswords = activity.filter((item) => item.action === 'LOGIN_FAILED').length;
  const days = new Set(activity.map((item) => item.created_at.slice(0, 10))).size;
  const areas = new Map();
  activity.forEach((item) => areas.set(item.area, (areas.get(item.area) || 0) + 1));
  return [
    facts([
      { label: 'Actions recorded', value: activity.length, format: 'number' },
      { label: 'Days active', value: days, format: 'number' },
      { label: 'Sign-ins', value: signIns, format: 'number' },
      { label: 'Wrong passwords', value: wrongPasswords, format: 'number' },
      { label: 'First action', value: activity[0]?.created_at, format: 'datetime' },
      { label: 'Last action', value: activity[activity.length - 1]?.created_at, format: 'datetime' },
    ]),
    bars(
      'Actions by part of the site',
      [...areas.entries()].map(([area, total]) => ({ label: area, value: total })).sort((a, b) => b.value - a.value),
      'number',
      { emptyText: 'No activity was recorded in this period.' }
    ),
    table(
      [
        { key: 'created_at', label: 'When', format: 'datetime', width: 'auto' },
        { key: 'area', label: 'Area', width: 'auto' },
        { key: 'detail', label: 'What they did' },
      ],
      activity,
      { title: 'Activity log (oldest first)', emptyText: 'Nothing was recorded for this person in this period.' }
    ),
    table(
      [
        { key: 'created_at', label: 'When', format: 'datetime', width: 'auto' },
        { key: 'by', label: 'By', width: 'auto' },
        { key: 'detail', label: 'What staff did' },
      ],
      staffActions,
      { title: 'Staff actions on this account', emptyText: 'No staff actions on this account in this period.' }
    ),
  ];
}

module.exports = { ACTIONS, actionName, areaOf, getActivity, getStaffActions, activityBlocks };
