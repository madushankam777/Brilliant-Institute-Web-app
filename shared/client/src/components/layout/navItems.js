export function getNavItems(role) {
  if (role === 'ADMIN') {
    return [
      { to: '/admin/dashboard', label: 'Dashboard', icon: 'home', end: true },
      { to: '/admin/users', label: 'Manage Users', icon: 'users' },
      { to: '/courses/manage', label: 'Manage Classes', icon: 'book' },
      { to: '/admin/payments/verify', label: 'Payment Verification', icon: 'wallet' },
      { to: '/admin/payments/tutors', label: 'Pay Tutors', icon: 'card' },
      { to: '/admin/payments/settings', label: 'Payment Settings', icon: 'edit' },
      { to: '/admin/announcements', label: 'Announcements', icon: 'megaphone' },
      { to: '/admin/reregistration', label: 'Re-registration', icon: 'checkCircle' },
      { to: '/admin/feedback', label: 'Feedback', icon: 'chat' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ];
  }
  if (role === 'TUTOR') {
    return [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
      { to: '/courses/manage', label: 'My Classes', icon: 'book' },
      { to: '/students/mine', label: 'My Students', icon: 'users' },
      { to: '/notify', label: 'Notify Students', icon: 'megaphone' },
      { to: '/admin/feedback', label: 'Feedback', icon: 'chat' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ];
  }
  return [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/courses/classes', label: 'Browse Classes', icon: 'search' },
    { to: '/courses/my-courses', label: 'My Courses', icon: 'book' },
    { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
    { to: '/attendance/checkin', label: 'Mark Attendance', icon: 'checkCircle' },
    { to: '/payments', label: 'Fees', icon: 'card' },
    { to: '/payments/history', label: 'History', icon: 'receipt' },
    { to: '/feedback', label: 'Feedback', icon: 'chat' },
    { to: '/reregister', label: 'Re-register', icon: 'checkCircle' },
    { to: '/profile', label: 'My Profile', icon: 'user' },
  ];
}
