import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const isTutorOrAdmin = user && (user.role === 'TUTOR' || user.role === 'ADMIN');
  const isStudentParent = user && user.role === 'STUDENT_PARENT';

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <NavLink to="/">Brilliant Institute</NavLink>
      </div>

      <nav className="navbar-links">
        {isLoggedIn && isTutorOrAdmin && (
          <NavLink to="/attendance/classes">Mark Attendance</NavLink>
        )}
        {isLoggedIn && isStudentParent && (
          <>
            <NavLink to="/attendance/history">My Attendance</NavLink>
            <NavLink to="/payments">Fee Balance</NavLink>
            <NavLink to="/payments/history">Payment History</NavLink>
          </>
        )}
      </nav>

      <div className="navbar-actions">
        {isLoggedIn ? (
          <>
            <span className="navbar-user">
              {user.fullName} <span className="badge">{user.role}</span>
            </span>
            <button type="button" className="btn btn-secondary" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <NavLink to="/login" className="btn btn-secondary">
            Log in
          </NavLink>
        )}
      </div>
    </header>
  );
}

export default Navbar;
