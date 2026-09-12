const CATEGORIES = Object.freeze([
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
]);

const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

const RECIPIENT_TYPES = Object.freeze(['ADMIN', 'ADMIN_TUTOR', 'TUTOR']);

const STATUSES = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
});

module.exports = { CATEGORIES, PRIORITIES, RECIPIENT_TYPES, STATUSES };
