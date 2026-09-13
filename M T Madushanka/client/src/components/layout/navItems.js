// Nav items for this standalone module only - unlike the shared navItems.js
// (built for the combined site), this list only points at routes that
// actually exist in this module's own App.jsx.
const STUDENT_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
  { to: '/attendance/checkin', label: 'Mark Attendance', icon: 'checkCircle' },
  { to: '/payments', label: 'Fees', icon: 'card' },
  { to: '/payments/history', label: 'History', icon: 'receipt' },
];

const TUTOR_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
];

const ADMIN_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
  { to: '/admin/payments/verify', label: 'Payment Verification', icon: 'wallet' },
  { to: '/admin/payments/tutors', label: 'Pay Tutors', icon: 'card' },
];

export function getNavItems(role) {
  if (role === 'TUTOR') return TUTOR_NAV;
  if (role === 'ADMIN') return ADMIN_NAV;
  return STUDENT_NAV;
}
