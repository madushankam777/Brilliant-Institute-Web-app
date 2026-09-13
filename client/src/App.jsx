import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';
import NotFoundPage from '../../shared/client/src/pages/NotFoundPage';

import HomePage from './pages/HomePage';
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
import PaymentVerificationPage from './pages/payment/PaymentVerificationPage';
import PayTutorsPage from './pages/payment/PayTutorsPage';

import BrowseClassesPage from './pages/courses/BrowseClassesPage';
import ClassDetailsPage from './pages/courses/ClassDetailsPage';
import TutorProfilePage from './pages/courses/TutorProfilePage';
import MyCoursesPage from './pages/courses/MyCoursesPage';
import ManageClassesPage from './pages/courses/ManageClassesPage';
import CreateEditClassPage from './pages/courses/CreateEditClassPage';
import MyStudentsPage from './pages/courses/MyStudentsPage';

import SubmitFeedbackPage from './pages/feedback/SubmitFeedbackPage';
import StaffFeedbackPage from './pages/feedback/StaffFeedbackPage';

import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import ManageUsersPage from './pages/admin/ManageUsersPage';
import UserProfilePage from './pages/admin/UserProfilePage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <main className="app-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Any logged-in user */}
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/courses/classes" element={<BrowseClassesPage />} />
            <Route path="/courses/classes/:classId" element={<ClassDetailsPage />} />
            <Route path="/courses/tutors/:tutorId" element={<TutorProfilePage />} />
          </Route>

          {/* Tutor / Admin only - Attendance marking + Course Management + Feedback triage */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/attendance/classes" element={<ClassSessionsPage />} />
            <Route path="/attendance/classes/:classId/sessions" element={<ClassSessionsPage />} />
            <Route path="/attendance/sessions/:sessionId" element={<MarkAttendancePage />} />
            <Route path="/attendance/students/:studentId" element={<TutorStudentHistoryPage />} />
            <Route path="/courses/manage" element={<ManageClassesPage />} />
            <Route path="/courses/manage/new" element={<CreateEditClassPage />} />
            <Route path="/courses/manage/:classId/edit" element={<CreateEditClassPage />} />
            <Route path="/admin/feedback" element={<StaffFeedbackPage />} />
          </Route>

          {/* Student / Parent only - Attendance history + Payments + My Courses */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT']} />}>
            <Route path="/attendance/history" element={<AttendanceHistoryPage />} />
            <Route path="/attendance/checkin" element={<SelfCheckInPage />} />
            <Route path="/payments" element={<FeeBalancePage />} />
            <Route path="/payments/history" element={<PaymentHistoryPage />} />
            <Route path="/courses/my-courses" element={<MyCoursesPage />} />
          </Route>

          {/* Student / Parent or Tutor - submit + track feedback tickets */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT', 'TUTOR']} />}>
            <Route path="/feedback" element={<SubmitFeedbackPage />} />
          </Route>

          {/* Tutor only - their own student roster */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR']} />}>
            <Route path="/students/mine" element={<MyStudentsPage />} />
          </Route>

          {/* Admin only - operations dashboard, user management, announcements */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<ManageUsersPage />} />
            <Route path="/admin/users/:userId" element={<UserProfilePage />} />
            <Route path="/admin/payments/verify" element={<PaymentVerificationPage />} />
            <Route path="/admin/payments/tutors" element={<PayTutorsPage />} />
            <Route path="/admin/announcements" element={<AnnouncementsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
