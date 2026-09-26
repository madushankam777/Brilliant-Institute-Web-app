// shortLabel is what fits in the phone tab bar; the sidebar shows the full label
export function getNavItems(role) {
  if (role === 'ADMIN') {
    return [
      { to: '/admin/dashboard', label: 'Dashboard', icon: 'home', end: true },
      { to: '/admin/users', label: 'Manage Users', shortLabel: 'Users', icon: 'users' },
      { to: '/courses/manage', label: 'Manage Classes', shortLabel: 'Classes', icon: 'book' },
      { to: '/calendar', label: 'Calendar', icon: 'calendarDays' },
      { to: '/admin/timetables', label: 'Timetables', icon: 'grid' },
      { to: '/admin/payments/verify', label: 'Payment Verification', icon: 'wallet' },
      { to: '/admin/payments/tutors', label: 'Pay Tutors', icon: 'bank' },
      { to: '/admin/payments/settings', label: 'Payment Settings', icon: 'card' },
      { to: '/admin/announcements', label: 'Announcements', icon: 'megaphone' },
      { to: '/admin/reregistration', label: 'Re-registration', icon: 'refresh' },
      { to: '/admin/feedback', label: 'Feedback', icon: 'chat' },
      { to: '/admin/enquiries', label: 'Enquiries', icon: 'inbox' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ];
  }
  if (role === 'TUTOR') {
    return [
      { to: '/', label: 'Dashboard', icon: 'home', end: true },
      { to: '/attendance/classes', label: 'Mark Attendance', shortLabel: 'Attendance', icon: 'checkCircle' },
      { to: '/courses/manage', label: 'My Classes', shortLabel: 'Classes', icon: 'book' },
      { to: '/calendar', label: 'Calendar', icon: 'calendarDays' },
      { to: '/students/mine', label: 'My Students', shortLabel: 'Students', icon: 'users' },
      { to: '/reminders', label: 'Reminders', icon: 'clock' },
      { to: '/notify', label: 'Notify Students', icon: 'megaphone' },
      { to: '/admin/feedback', label: 'Feedback', icon: 'chat' },
      { to: '/profile', label: 'My Profile', icon: 'user' },
    ];
  }
  return [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/courses/classes', label: 'Browse Classes', shortLabel: 'Browse', icon: 'search' },
    { to: '/courses/my-courses', label: 'My Courses', shortLabel: 'Courses', icon: 'book' },
    { to: '/calendar', label: 'Calendar', icon: 'calendarDays' },
    { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
    { to: '/attendance/checkin', label: 'Mark Attendance', icon: 'checkCircle' },
    { to: '/payments', label: 'Fees', icon: 'card', end: true },
    { to: '/payments/history', label: 'History', icon: 'receipt' },
    { to: '/feedback', label: 'Feedback', icon: 'chat' },
    { to: '/reregister', label: 'Re-register', icon: 'refresh' },
    { to: '/profile', label: 'My Profile', icon: 'user' },
  ];
}
