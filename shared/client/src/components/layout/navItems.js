// One canonical sidebar/tab-bar item list per role, so every page in the
// combined site (Registration/Login + Attendance/Payment) links to every
// function that role actually has - not just the page it was written for.
export function getNavItems(role) {
  if (role === 'TUTOR' || role === 'ADMIN') {
    return [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ];
  }
  return [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
    { to: '/payments', label: 'Fees', icon: 'card' },
    { to: '/payments/history', label: 'History', icon: 'receipt' },
    { to: '/profile', label: 'My Profile', icon: 'user' },
  ];
}
