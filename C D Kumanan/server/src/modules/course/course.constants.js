// Class/enrollment status enums + the fixed subject-area filter list shown
// on the Browse Classes page.
const CLASS_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
});

const ENROLLMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DROPPED: 'DROPPED',
});

const SUBJECT_AREAS = Object.freeze([
  'Mathematics',
  'Science',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'Other',
]);

const DAYS_OF_WEEK = Object.freeze([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);

module.exports = { CLASS_STATUS, ENROLLMENT_STATUS, SUBJECT_AREAS, DAYS_OF_WEEK };
