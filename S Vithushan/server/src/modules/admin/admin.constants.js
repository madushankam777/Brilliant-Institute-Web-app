// who an announcement is for
const TARGET_AUDIENCES = Object.freeze(['ALL', 'STUDENT_PARENT', 'TUTOR']);
// announcement priorities
const ANNOUNCEMENT_PRIORITIES = Object.freeze(['NORMAL', 'HIGH']);
// reminders an admin can send to students
const REMINDER_TYPES = Object.freeze(['FEE_DUE', 'LOW_ATTENDANCE']);
// account states an admin can set
const USER_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED']);

module.exports = { TARGET_AUDIENCES, ANNOUNCEMENT_PRIORITIES, REMINDER_TYPES, USER_STATUSES };
