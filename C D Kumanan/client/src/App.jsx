// Route table for the Course Management module
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import CookieConsentBanner from '../../../shared/client/src/components/common/CookieConsentBanner';
import ProtectedRoute from './components/layout/ProtectedRoute';

import HomePage from './pages/HomePage';
import NotFoundPage from '../../../shared/client/src/pages/NotFoundPage';
import PlaceholderLoginPage from './pages/PlaceholderLoginPage';

import BrowseClassesPage from './pages/courses/BrowseClassesPage';
import ClassDetailsPage from './pages/courses/ClassDetailsPage';
import TutorProfilePage from './pages/courses/TutorProfilePage';
import MyCoursesPage from './pages/courses/MyCoursesPage';
import ManageClassesPage from './pages/courses/ManageClassesPage';
import CreateEditClassPage from './pages/courses/CreateEditClassPage';
import MyStudentsPage from './pages/courses/MyStudentsPage';

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <CookieConsentBanner />
      <main className="app-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PlaceholderLoginPage />} />

          {/* Any logged-in role - browse & view details */}
          <Route element={<ProtectedRoute />}>
            <Route path="/courses/classes" element={<BrowseClassesPage />} />
            <Route path="/courses/classes/:classId" element={<ClassDetailsPage />} />
            <Route path="/courses/tutors/:tutorId" element={<TutorProfilePage />} />
          </Route>

          {/* Tutor / Admin only - manage own classes */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR', 'ADMIN']} />}>
            <Route path="/courses/manage" element={<ManageClassesPage />} />
            <Route path="/courses/manage/new" element={<CreateEditClassPage />} />
            <Route path="/courses/manage/:classId/edit" element={<CreateEditClassPage />} />
          </Route>

          {/* Tutor only - their own student roster */}
          <Route element={<ProtectedRoute allowedRoles={['TUTOR']} />}>
            <Route path="/students/mine" element={<MyStudentsPage />} />
          </Route>

          {/* Student / Parent only - enrolments */}
          <Route element={<ProtectedRoute allowedRoles={['STUDENT_PARENT']} />}>
            <Route path="/courses/my-courses" element={<MyCoursesPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}

export default App;
