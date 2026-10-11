// what a student / parent can write about
const STUDENT_CATEGORIES = Object.freeze([
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
]);

// what a tutor can write to the office about
const TUTOR_CATEGORIES = Object.freeze([
  'Timetable & Room Booking',
  'Student Attendance & Behaviour',
  'Payout & Salary Inquiry',
  'Teaching Resources & Equipment',
  'Technical Issue',
  'Other',
]);

// every category (each role is checked against its own list)
const CATEGORIES = Object.freeze([...new Set([...STUDENT_CATEGORIES, ...TUTOR_CATEGORIES])]);

// ticket priorities
const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

// who a ticket is for: the admin, a tutor, or both
const RECIPIENT_TYPES = Object.freeze(['ADMIN', 'ADMIN_TUTOR', 'TUTOR']);

// ticket states - a staff reply moves PENDING to IN_PROGRESS, resolving makes it RESOLVED
const STATUSES = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
});

module.exports = { CATEGORIES, STUDENT_CATEGORIES, TUTOR_CATEGORIES, PRIORITIES, RECIPIENT_TYPES, STATUSES };
