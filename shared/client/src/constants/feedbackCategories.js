// feedback categories - the same names and colours on the student, tutor and admin pages

// what a student / parent can write about
export const STUDENT_CATEGORIES = [
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
];

// what a tutor can write to the office about
export const TUTOR_CATEGORIES = [
  'Timetable & Room Booking',
  'Student Attendance & Behaviour',
  'Payout & Salary Inquiry',
  'Teaching Resources & Equipment',
  'Technical Issue',
  'Other',
];

// one colour per category (Technical Issue and Other look the same for everyone)
const CATEGORY_TONES = {
  'Class Scheduling Issue': 'blue',
  'Class Quality & Tutor Feedback': 'teal',
  'Billing / Payment Inquiry': 'amber',
  'Technical Issue': 'purple',
  Other: 'grey',
  'Timetable & Room Booking': 'fuchsia',
  'Student Attendance & Behaviour': 'rose',
  'Payout & Salary Inquiry': 'green',
  'Teaching Resources & Equipment': 'orange',
};

// the colour name of a category (unknown ones are grey)
export function categoryTone(category) {
  return CATEGORY_TONES[category] || 'grey';
}

// the categories a role can choose from
export function categoriesFor(role) {
  return role === 'TUTOR' ? TUTOR_CATEGORIES : STUDENT_CATEGORIES;
}
