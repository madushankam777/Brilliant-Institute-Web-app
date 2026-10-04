// Nav items for this standalone module only
const STUDENT_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
  { to: '/attendance/checkin', label: 'Mark Attendance', icon: 'checkCircle' },
  { to: '/payments', label: 'Fees', icon: 'card' },
  { to: '/payments/history', label: 'History', icon: 'receipt' },
];

// the tutor's side menu
const TUTOR_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
];

// the admin's side menu
const ADMIN_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
  { to: '/admin/payments/verify', label: 'Payment Verification', icon: 'wallet' },
  { to: '/admin/payments/tutors', label: 'Pay Tutors', icon: 'card' },
  { to: '/admin/payments/settings', label: 'Payment Settings', icon: 'edit' },
];

// the side menu for a role
export function getNavItems(role) {
  if (role === 'TUTOR') return TUTOR_NAV;
  if (role === 'ADMIN') return ADMIN_NAV;
  return STUDENT_NAV;
}
