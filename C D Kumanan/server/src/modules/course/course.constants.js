// Class/enrollment status enums + the fixed subject-area filter list
const CLASS_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
});

// enrolment states
const ENROLLMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DROPPED: 'DROPPED',
});

// subject areas offered in the class filter
const SUBJECT_AREAS = Object.freeze([
  'Mathematics',
  'Science',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'Other',
]);

// days a class can run on
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
