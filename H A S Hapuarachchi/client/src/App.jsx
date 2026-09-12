// Route table for the Feedback & Complaint module
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import ProtectedRoute from './components/layout/ProtectedRoute';

import HomePage from './pages/HomePage';
import NotFoundPage from '../../../shared/client/src/pages/NotFoundPage';
import PlaceholderLoginPage from './pages/PlaceholderLoginPage';

import SubmitFeedbackPage from './pages/feedback/SubmitFeedbackPage';
import StaffFeedbackPage from './pages/feedback/StaffFeedbackPage';

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PlaceholderLoginPage />} />

          {/* Student / Parent or Tutor - submit + track own tickets */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT', 'TUTOR']} />}>
            <Route path="/feedback" element={<SubmitFeedbackPage />} />
          </Route>

          {/* Tutor / Admin only - respond to every ticket */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/admin/feedback" element={<StaffFeedbackPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
