// Attendance status enum
const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
});

const VALID_ATTENDANCE_STATUSES = Object.values(ATTENDANCE_STATUS);

// self check-in code stays valid this many minutes after the tutor opens it
const CHECKIN_CODE_VALID_MINUTES = 15;

module.exports = { ATTENDANCE_STATUS, VALID_ATTENDANCE_STATUSES, CHECKIN_CODE_VALID_MINUTES };
