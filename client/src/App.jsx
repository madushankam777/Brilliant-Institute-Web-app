// Route table for the combined site: Registration & Login
// (N Danushika) plus Attendance & Payment (M T Madushanka), all under one
// login and one running app.
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

import FeeBalancePage from './pages/payment/FeeBalancePage';
import PaymentHistoryPage from './pages/payment/PaymentHistoryPage';

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
          </Route>

          {/* Tutor / Admin only - Attendance marking */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/attendance/classes" element={<ClassSessionsPage />} />
            <Route path="/attendance/classes/:classId/sessions" element={<ClassSessionsPage />} />
            <Route path="/attendance/sessions/:sessionId" element={<MarkAttendancePage />} />
            <Route path="/attendance/students/:studentId" element={<TutorStudentHistoryPage />} />
          </Route>

          {/* Student / Parent only - Attendance history + Payments */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT']} />}>
            <Route path="/attendance/history" element={<AttendanceHistoryPage />} />
            <Route path="/payments" element={<FeeBalancePage />} />
            <Route path="/payments/history" element={<PaymentHistoryPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
