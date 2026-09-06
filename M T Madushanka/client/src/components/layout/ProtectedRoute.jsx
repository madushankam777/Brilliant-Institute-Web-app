// Frontend route guard (server still re-checks access)
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';

function ProtectedRoute({ allowedRoles }) {
  const { isLoggedIn, isCheckingSession, user } = useAuth();
  const location = useLocation();

  if (isCheckingSession) {
    return <LoadingSpinner label="Checking your session..." />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
