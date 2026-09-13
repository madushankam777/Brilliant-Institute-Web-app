// Route table for the Admin, Notifications & Announcements module
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import CookieConsentBanner from '../../../shared/client/src/components/common/CookieConsentBanner';
import ProtectedRoute from './components/layout/ProtectedRoute';

import HomePage from './pages/HomePage';
import NotFoundPage from '../../../shared/client/src/pages/NotFoundPage';
import PlaceholderLoginPage from './pages/PlaceholderLoginPage';

import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import ManageUsersPage from './pages/admin/ManageUsersPage';
import UserProfilePage from './pages/admin/UserProfilePage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <CookieConsentBanner />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PlaceholderLoginPage />} />

          {/* Admin only */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<ManageUsersPage />} />
            <Route path="/admin/users/:userId" element={<UserProfilePage />} />
            <Route path="/admin/announcements" element={<AnnouncementsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
