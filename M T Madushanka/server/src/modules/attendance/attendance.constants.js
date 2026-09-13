// Attendance status enum
const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
});

const VALID_ATTENDANCE_STATUSES = Object.values(ATTENDANCE_STATUS);

module.exports = { ATTENDANCE_STATUS, VALID_ATTENDANCE_STATUSES };
