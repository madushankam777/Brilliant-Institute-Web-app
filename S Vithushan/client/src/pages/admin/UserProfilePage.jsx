// Admin: read-only view of a single user's/tutor's full profile
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUserProfile } from '../../api/adminApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';

// the side menu for an admin
const NAV_ITEMS = getNavItems('ADMIN');

// badge colour for Active, Suspended or other
function statusBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'SUSPENDED') return 'badge badge-danger';
  return 'badge badge-neutral';
}

// user profile - an admin's read-only view of one account, with a reset link, timetable and tutor documents
function UserProfilePage() {
  const { userId } = useParams();

  // the user, the timetable and the page state
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // load the user
  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchUserProfile(userId);
      setUser(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // load it when the page opens
  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <LoadingSpinner label="Loading profile..." />
        </div>
      </PortalShell>
    );
  }

  // the user could not be loaded
  if (loadError || !user) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <Alert type="error" message={loadError || 'User not found.'} />
          <Link to="/admin/users" className="btn btn-secondary">
            Back to Manage Users
          </Link>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        {/* breadcrumb back to Manage Users */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin/users">Manage Users</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{user.fullName}</span>
        </nav>

        {/* profile - picture, name, role, status, contact details and bio */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={64} />
            <div>
              <h1 style={{ marginBottom: '4px' }}>{user.fullName}</h1>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge badge-neutral">{user.role.replace('_', ' / ')}</span>
                <span className={statusBadgeClass(user.status)}>{user.status}</span>
              </div>
            </div>
          </div>

          {/* contact details and dates */}
          <div className="feature-grid">
            <div>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Email</p>
              <p style={{ marginTop: 0 }}>{user.email}</p>
            </div>
            <div>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Phone</p>
              <p style={{ marginTop: 0 }}>{user.phone || 'Not provided'}</p>
            </div>
            {user.role === 'STUDENT_PARENT' && (
              <>
                <div>
                  <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Student Code</p>
                  <p style={{ marginTop: 0 }}>{user.studentCode || 'Not assigned'}</p>
                </div>
                <div>
                  <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Grade</p>
                  <p style={{ marginTop: 0 }}>{user.grade || 'Not set'}</p>
                </div>
              </>
            )}
            <div>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Joined</p>
              <p style={{ marginTop: 0 }}>{user.createdAt}</p>
            </div>
            <div>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Last Login</p>
              <p style={{ marginTop: 0 }}>{user.lastLoginAt || 'Never logged in'}</p>
            </div>
          </div>

          {/* bio */}
          {user.bio && (
            <div style={{ marginTop: '18px' }}>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Bio</p>
              <p style={{ marginTop: 0 }}>{user.bio}</p>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export default UserProfilePage;
