import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { INSTITUTE } from '../../shared/client/src/constants/institute';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';
import NotFoundPage from '../../shared/client/src/pages/NotFoundPage';
import CookieConsentBanner from '../../shared/client/src/components/common/CookieConsentBanner';
import TopProgressBar from '../../shared/client/src/components/common/TopProgressBar';

import HomePage from './pages/HomePage';
import AboutPage from './pages/public/AboutPage';
import ContactPage from './pages/public/ContactPage';
import LegalPage from './pages/public/LegalPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ProfilePage from './pages/auth/ProfilePage';

import ClassSessionsPage from './pages/attendance/ClassSessionsPage';
import MarkAttendancePage from './pages/attendance/MarkAttendancePage';
import AttendanceHistoryPage from './pages/attendance/AttendanceHistoryPage';
import TutorStudentHistoryPage from './pages/attendance/TutorStudentHistoryPage';
import SelfCheckInPage from './pages/attendance/SelfCheckInPage';

import FeeBalancePage from './pages/payment/FeeBalancePage';
import PaymentHistoryPage from './pages/payment/PaymentHistoryPage';
import PaymentReturnPage from './pages/payment/PaymentReturnPage';
import PaymentVerificationPage from './pages/payment/PaymentVerificationPage';
import PayTutorsPage from './pages/payment/PayTutorsPage';
import PaymentSettingsPage from './pages/payment/PaymentSettingsPage';

import BrowseClassesPage from './pages/courses/BrowseClassesPage';
import ClassDetailsPage from './pages/courses/ClassDetailsPage';
import TutorProfilePage from './pages/courses/TutorProfilePage';
import MyCoursesPage from './pages/courses/MyCoursesPage';
import ManageClassesPage from './pages/courses/ManageClassesPage';
import CreateEditClassPage from './pages/courses/CreateEditClassPage';
import MyStudentsPage from './pages/courses/MyStudentsPage';

import SubmitFeedbackPage from './pages/feedback/SubmitFeedbackPage';
import StaffFeedbackPage from './pages/feedback/StaffFeedbackPage';

import NotifyStudentsPage from './pages/notifications/NotifyStudentsPage';
import RemindersPage from './pages/notifications/RemindersPage';
import CalendarPage from './pages/calendar/CalendarPage';

import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import ManageUsersPage from './pages/admin/ManageUsersPage';
import UserProfilePage from './pages/admin/UserProfilePage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';
import ReregistrationPage from './pages/admin/ReregistrationPage';
import TimetablesPage from './pages/admin/TimetablesPage';
import ReregisterPage from './pages/auth/ReregisterPage';
import EnquiriesPage from './pages/admin/EnquiriesPage';

// browser tab title for each page
// Google text for public pages - every other page is kept out of search
const SEARCH_DESCRIPTIONS = {
  '/': 'Brilliant Institute is a tuition institute at 136 Sangamitha Mawatha, Colombo 13. Find classes and tutors, check timetables, track attendance and pay fees online.',
  '/about': 'About Brilliant Institute in Colombo 13 - our vision, mission, experienced tutors and answers to common questions.',
  '/contact': 'Contact Brilliant Institute - 136, Sangamitha Mawatha, Colombo 13. Call 0112 347 728 or send us a message.',
  '/register': 'Create your Brilliant Institute account to enrol in classes, see your timetable and pay fees online.',
  '/login': 'Log in to Brilliant Institute to see your classes, attendance and fees.',
  '/privacy': 'How Brilliant Institute collects, uses and protects your personal information.',
  '/terms': 'Terms of service for using the Brilliant Institute website.',
};

// set a <meta> / <link> tag in the page head
function setHeadTag(selector, create, attr, value) {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = create();
    document.head.appendChild(tag);
  }
  tag.setAttribute(attr, value);
}

function metaTag(name) {
  const tag = document.createElement('meta');
  tag.setAttribute('name', name);
  return tag;
}

const PAGE_TITLES = [
  [/^\/$/, 'Home'],
  [/^\/about/, 'About Us'],
  [/^\/contact/, 'Contact Us'],
  [/^\/privacy/, 'Privacy Policy'],
  [/^\/terms/, 'Terms of Service'],
  [/^\/login/, 'Log in'],
  [/^\/register/, 'Register'],
  [/^\/(forgot|reset)-password/, 'Reset password'],
  [/^\/profile/, 'My Profile'],
  [/^\/calendar/, 'Calendar'],
  [/^\/courses\/classes\/\d+/, 'Class details'],
  [/^\/courses\/classes/, 'Browse Classes'],
  [/^\/courses\/tutors/, 'Tutor profile'],
  [/^\/courses\/my-courses/, 'My Courses'],
  [/^\/courses\/manage\/new/, 'Create Class'],
  [/^\/courses\/manage\/\d+/, 'Edit Class'],
  [/^\/courses\/manage/, 'Classes'],
  [/^\/attendance\/checkin/, 'Mark Attendance'],
  [/^\/attendance\/history/, 'Attendance'],
  [/^\/attendance/, 'Attendance'],
  [/^\/payments\/history/, 'Payment History'],
  [/^\/payments\/return/, 'Payment'],
  [/^\/payments/, 'Fees'],
  [/^\/feedback/, 'Feedback'],
  [/^\/reregister/, 'Re-register'],
  [/^\/students\/mine/, 'My Students'],
  [/^\/notify/, 'Notify Students'],
  [/^\/reminders/, 'Reminders'],
  [/^\/admin\/dashboard/, 'Dashboard'],
  [/^\/admin\/users/, 'Manage Users'],
  [/^\/admin\/timetables/, 'Timetables'],
  [/^\/admin\/payments\/verify/, 'Payment Verification'],
  [/^\/admin\/payments\/tutors/, 'Pay Tutors'],
  [/^\/admin\/payments\/settings/, 'Payment Settings'],
  [/^\/admin\/announcements/, 'Announcements'],
  [/^\/admin\/reregistration/, 'Re-registration'],
  [/^\/admin\/feedback/, 'Feedback'],
  [/^\/admin\/enquiries/, 'Enquiries'],
];

// a new page starts at the top (links to #sections are left alone) and gets its tab title
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  useEffect(() => {
    const match = PAGE_TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = match ? `${match[1]} | Brilliant Institute` : 'Brilliant Institute';
    // public home page title for Google
    if (pathname === '/' && !user) document.title = 'Brilliant Institute | Tuition Classes in Colombo 13';

    // search tags
    const description = SEARCH_DESCRIPTIONS[pathname];
    setHeadTag('meta[name="description"]', () => metaTag('description'), 'content', description || SEARCH_DESCRIPTIONS['/']);
    setHeadTag('meta[name="robots"]', () => metaTag('robots'), 'content', description ? 'index, follow' : 'noindex');
    setHeadTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', `${INSTITUTE.website}${pathname}`);
  }, [pathname, user]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <TopProgressBar />
      <Navbar />
      <CookieConsentBanner />
      <main className="app-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />

          {/* Any logged-in user */}
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/courses/classes" element={<BrowseClassesPage />} />
            <Route path="/courses/classes/:classId" element={<ClassDetailsPage />} />
            <Route path="/courses/tutors/:tutorId" element={<TutorProfilePage />} />
          </Route>

          {/* Tutor / Admin only - Attendance marking + Course Management + Feedback triage */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/attendance/classes" element={<ClassSessionsPage />} />
            <Route path="/attendance/sessions/:sessionId" element={<MarkAttendancePage />} />
            <Route path="/attendance/students/:studentId" element={<TutorStudentHistoryPage />} />
            <Route path="/courses/manage" element={<ManageClassesPage />} />
            <Route path="/courses/manage/:classId/edit" element={<CreateEditClassPage />} />
            <Route path="/admin/feedback" element={<StaffFeedbackPage />} />
          </Route>

          {/* Student / Parent only - Attendance history + Payments + My Courses */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT']} />}>
            <Route path="/attendance/history" element={<AttendanceHistoryPage />} />
            <Route path="/attendance/checkin" element={<SelfCheckInPage />} />
            <Route path="/payments" element={<FeeBalancePage />} />
            <Route path="/payments/history" element={<PaymentHistoryPage />} />
            {/* where PayHere sends the payer back to */}
            <Route path="/payments/return" element={<PaymentReturnPage />} />
            <Route path="/courses/my-courses" element={<MyCoursesPage />} />
          </Route>

          {/* Student / Parent or Tutor - submit + track feedback tickets */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT', 'TUTOR']} />}>
            <Route path="/feedback" element={<SubmitFeedbackPage />} />
            <Route path="/reregister" element={<ReregisterPage />} />
          </Route>

          {/* Tutor only - their own student roster, notices and scheduled reminders */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR']} />}>
            <Route path="/students/mine" element={<MyStudentsPage />} />
            <Route path="/notify" element={<NotifyStudentsPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
          </Route>

          {/* Admin only - operations dashboard, user management, announcements */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            {/* only Admin creates classes; tutors edit the ones assigned to them */}
            <Route path="/courses/manage/new" element={<CreateEditClassPage />} />
            <Route path="/admin/users" element={<ManageUsersPage />} />
            <Route path="/admin/users/:userId" element={<UserProfilePage />} />
            <Route path="/admin/timetables" element={<TimetablesPage />} />
            <Route path="/admin/payments/verify" element={<PaymentVerificationPage />} />
            <Route path="/admin/payments/tutors" element={<PayTutorsPage />} />
            <Route path="/admin/payments/settings" element={<PaymentSettingsPage />} />
            <Route path="/admin/announcements" element={<AnnouncementsPage />} />
            <Route path="/admin/reregistration" element={<ReregistrationPage />} />
            <Route path="/admin/enquiries" element={<EnquiriesPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
