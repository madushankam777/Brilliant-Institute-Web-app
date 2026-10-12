// Route table for the Attendance & Payment module
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';
import CookieConsentBanner from '../../../shared/client/src/components/common/CookieConsentBanner';

import HomePage from './pages/HomePage';
import NotFoundPage from '../../../shared/client/src/pages/NotFoundPage';
import PlaceholderLoginPage from './pages/PlaceholderLoginPage';
import PlaceholderRegisterPage from './pages/PlaceholderRegisterPage';

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

// the whole website
function App() {
  return (
    <AuthProvider>
      <Navbar />
      <CookieConsentBanner />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PlaceholderLoginPage />} />
          <Route path="/register" element={<PlaceholderRegisterPage />} />

          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/attendance/classes" element={<ClassSessionsPage />} />
            <Route path="/attendance/sessions/:sessionId" element={<MarkAttendancePage />} />
            <Route path="/attendance/students/:studentId" element={<TutorStudentHistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT']} />}>
            <Route path="/attendance/history" element={<AttendanceHistoryPage />} />
            <Route path="/attendance/checkin" element={<SelfCheckInPage />} />
            <Route path="/payments" element={<FeeBalancePage />} />
            <Route path="/payments/history" element={<PaymentHistoryPage />} />
            <Route path="/payments/return" element={<PaymentReturnPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/payments/verify" element={<PaymentVerificationPage />} />
            <Route path="/admin/payments/tutors" element={<PayTutorsPage />} />
            <Route path="/admin/payments/settings" element={<PaymentSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
