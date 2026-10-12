// Attendance status enum
const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
});

// the allowed statuses as a list, for validation
const VALID_ATTENDANCE_STATUSES = Object.values(ATTENDANCE_STATUS);

const CHECKIN_CODE_VALID_MINUTES = 15;

module.exports = { ATTENDANCE_STATUS, VALID_ATTENDANCE_STATUSES, CHECKIN_CODE_VALID_MINUTES };
