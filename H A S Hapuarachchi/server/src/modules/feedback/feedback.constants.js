// ticket categories - what a feedback or complaint can be about
const CATEGORIES = Object.freeze([
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
]);

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

module.exports = { CATEGORIES, PRIORITIES, RECIPIENT_TYPES, STATUSES };
