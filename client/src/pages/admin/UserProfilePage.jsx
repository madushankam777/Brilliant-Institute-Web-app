// Admin: read-only view of a single user's/tutor's full profile
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUserProfile } from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const NAV_ITEMS = getNavItems('ADMIN');

function statusBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'SUSPENDED') return 'badge badge-danger';
  return 'badge badge-neutral';
}

function UserProfilePage() {
  const { userId } = useParams();

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin/users">Manage Users</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{user.fullName}</span>
        </nav>

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

          {user.bio && (
            <div style={{ marginTop: '18px' }}>
              <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Bio</p>
              <p style={{ marginTop: 0 }}>{user.bio}</p>
            </div>
          )}

          {user.role === 'TUTOR' && (
            <div style={{ marginTop: '18px' }}>
              <Link to={`/courses/tutors/${user.id}`} className="btn btn-secondary btn-sm">
                View Teaching Profile & Classes
              </Link>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export default UserProfilePage;
