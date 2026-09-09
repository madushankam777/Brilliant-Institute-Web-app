// Route table for the Attendance & Payment module
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';

import HomePage from './pages/HomePage';
import NotFoundPage from '../../../shared/client/src/pages/NotFoundPage';
import PlaceholderLoginPage from './pages/PlaceholderLoginPage';

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
          <Route path="/login" element={<PlaceholderLoginPage />} />

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
