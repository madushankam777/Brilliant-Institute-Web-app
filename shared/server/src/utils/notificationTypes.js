// kinds of bell notification - the older kind each falls back to, and the page each opens

// newer kinds fall back to an older kind until sql/update_database.sql has been run
const LEGACY_TYPE = {
  PAYMENT_DUE: 'FEE_DUE',
  ENROLMENT_AT_RISK: 'FEE_DUE',
  ENROLMENT_RELEASED: 'FEE_DUE',
  SEAT_AVAILABLE: 'CLASS_REMINDER',
  PAYMENT_DECLINED: 'PAYMENT_REJECTED',
  SLIP_RECEIVED: 'PAYMENT_SUBMITTED',
  PAYOUT_FAILED: 'PAYOUT_RECORDED',
  CLASS_UPDATED: 'CLASS_REMINDER',
  CLASS_CANCELLED: 'CLASS_REMINDER',
  CLASS_ASSIGNED: 'CLASS_REMINDER',
  STUDENT_ENROLLED: 'CLASS_REMINDER',
  STUDENT_LEFT: 'CLASS_REMINDER',
  ABSENCE_MARKED: 'LOW_ATTENDANCE',
  FEEDBACK_NEW: 'ANNOUNCEMENT',
  FEEDBACK_REPLY: 'ANNOUNCEMENT',
  FEEDBACK_RESOLVED: 'ANNOUNCEMENT',
  ENQUIRY_NEW: 'ANNOUNCEMENT',
  WELCOME: 'ANNOUNCEMENT',
  ACCOUNT_STATUS: 'ACCOUNT_CLOSED',
  PASSWORD_CHANGED: 'ACCOUNT_CLOSED',
  NEW_MESSAGE: 'ANNOUNCEMENT',
};

// the page a notification saved without a link should open
function defaultLinkFor(type, role) {
  const isAdmin = role === 'ADMIN';
  const isStudent = role === 'STUDENT_PARENT';
  if (type === 'PAYMENT_SUBMITTED') return isAdmin ? '/admin/payments/verify' : '/payments/history';
  if (['PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'PAYMENT_DECLINED', 'SLIP_RECEIVED'].includes(type)) return '/payments/history';
  if (type === 'FEE_DUE' || type === 'PAYMENT_DUE' || type === 'ENROLMENT_AT_RISK') return '/payments';
  if (type === 'ENROLMENT_RELEASED' || type === 'CLASS_CANCELLED') return isStudent ? '/courses/my-courses' : '/courses/manage';
  if (type === 'SEAT_AVAILABLE') return '/courses/classes';
  if (type === 'CLASS_ASSIGNED' || type === 'STUDENT_ENROLLED' || type === 'STUDENT_LEFT') return '/courses/manage';
  if (type === 'LOW_ATTENDANCE' || type === 'ABSENCE_MARKED') return isStudent ? '/attendance/history' : '/attendance/classes';
  if (type === 'REREGISTRATION') return isAdmin ? '/admin/reregistration' : '/reregister';
  if (type === 'PAYOUT_RECORDED' || type === 'PAYOUT_FAILED') return isAdmin ? '/admin/payments/tutors' : '/profile';
  if (type === 'FEEDBACK_NEW') return '/admin/feedback';
  if (type === 'FEEDBACK_REPLY' || type === 'FEEDBACK_RESOLVED') return isAdmin ? '/admin/feedback' : '/feedback';
  if (type === 'ENQUIRY_NEW') return '/admin/enquiries';
  if (type === 'ACCOUNT_STATUS' || type === 'PASSWORD_CHANGED') return '/profile';
  if (type === 'WELCOME') return isAdmin ? '/admin/dashboard' : '/';
  if (type === 'NEW_MESSAGE') return '/messages';
  if (['CLASS_REMINDER', 'REMINDER', 'CLASS_UPDATED'].includes(type)) return '/calendar';
  return null;
}

module.exports = { LEGACY_TYPE, defaultLinkFor };
