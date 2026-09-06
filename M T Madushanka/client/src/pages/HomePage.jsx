// Landing page
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <div className="page hero">
        <h1>Brilliant Institute</h1>
        <p className="muted">Attendance &amp; Payment module (owner: M T Madushanka)</p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-primary">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const isTutorOrAdmin = user.role === 'TUTOR' || user.role === 'ADMIN';

  return (
    <div className="page">
      <h1>Welcome, {user.fullName}</h1>

      <div className="summary-grid">
        {isTutorOrAdmin ? (
          <Link to="/attendance/classes" className="card link-card">
            <h2>Mark Attendance</h2>
            <p className="muted">Open a class session and record who attended.</p>
          </Link>
        ) : (
          <>
            <Link to="/attendance/history" className="card link-card">
              <h2>My Attendance</h2>
              <p className="muted">Check your attendance history and rate.</p>
            </Link>
            <Link to="/payments" className="card link-card">
              <h2>Fee Balance</h2>
              <p className="muted">View outstanding fees and pay online.</p>
            </Link>
            <Link to="/payments/history" className="card link-card">
              <h2>Payment History</h2>
              <p className="muted">Review past payments and receipts.</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default HomePage;
