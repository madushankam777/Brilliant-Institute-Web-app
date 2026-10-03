// Admin: read-only view of a single user's/tutor's full profile
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUserProfile, getTutorKeyDocumentUrl } from '../../api/adminApi';
import { fetchUserTimetable } from '../../api/courseApi';
import { useUpcomingHolidays } from '../../hooks/useHolidays';
import { useUpcomingClassEvents } from '../../hooks/useClassEvents';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import WeeklyTimetable from '../../../../shared/client/src/components/common/WeeklyTimetable';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import ResetLinkCard from './ResetLinkCard';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';

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
  const [timetableClasses, setTimetableClasses] = useState(null);
  const holidays = useUpcomingHolidays();
  const events = useUpcomingClassEvents();

  // load the user (and the weekly timetable for a tutor or student)
  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchUserProfile(userId);
      setUser(data);
      // tutors and students also get their weekly timetable
      if (data.role !== 'ADMIN') {
        fetchUserTimetable(data.id)
          .then((timetable) => setTimetableClasses(timetable.classes))
          .catch(() => setTimetableClasses([]));
      }
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

  // a spinner while loading
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

  // the page - breadcrumb, the profile card, reset link, timetable and tutor documents
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
                  <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Registration No.</p>
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

          {/* links for a tutor or student - teaching profile, report and activity log */}
          {user.role !== 'ADMIN' && (
            <div style={{ marginTop: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {user.role === 'TUTOR' && (
                <Link to={`/courses/tutors/${user.id}`} className="btn btn-secondary btn-sm">
                  View Teaching Profile & Classes
                </Link>
              )}
              <ReportLink
                type={user.role === 'TUTOR' ? 'tutors' : 'students'}
                params={user.role === 'TUTOR' ? { tutorId: user.id } : { studentId: user.id }}
                label={user.role === 'TUTOR' ? 'Tutor report' : 'Student report'}
                className="btn btn-secondary btn-sm"
              />
              <ReportLink type="audit" params={{ userId: user.id }} label="Activity log" className="btn btn-secondary btn-sm" />
            </div>
          )}
          {/* an admin only has the activity log link */}
          {user.role === 'ADMIN' && (
            <div style={{ marginTop: '18px' }}>
              <ReportLink type="audit" params={{ userId: user.id }} label="Activity log" className="btn btn-secondary btn-sm" />
            </div>
          )}
        </div>

        {/* one-time password reset link */}
        {user.status !== 'DELETED' && <ResetLinkCard user={user} />}

        {/* weekly timetable */}
        {user.role !== 'ADMIN' && (
          <div className="card">
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <h2 style={{ margin: 0 }}>Weekly Timetable</h2>
              <Link to={`/admin/timetables?user=${user.id}`} className="btn btn-secondary btn-sm">
                Open in Timetables
              </Link>
            </div>
            {timetableClasses === null ? (
              <LoadingSpinner label="Loading timetable..." />
            ) : (
              <WeeklyTimetable
                classes={timetableClasses}
                holidays={holidays}
                events={events}
                showTutor={user.role !== 'TUTOR'}
                emptyMessage={
                  user.role === 'TUTOR'
                    ? 'This tutor has no classes assigned yet.'
                    : 'This student is not enrolled in any classes yet.'
                }
              />
            )}
          </div>
        )}

        {/* Admin-only: tutor's vetting documents */}
        {user.role === 'TUTOR' && (
          <div className="card">
            <h2>Verification documents</h2>
            <p className="muted" style={{ fontSize: '0.88rem', marginTop: '-4px' }}>
              Submitted when this Tutor&apos;s enrollment key was issued. Visible to Admin accounts only.
            </p>

            {/* no key documents, or the key details and the files */}
            {!user.enrollmentKey ? (
              <p className="muted">
                This Tutor was created directly by an Admin, so there are no enrollment-key documents on
                file for them.
              </p>
            ) : (
              <>
                <div className="feature-grid" style={{ marginBottom: '14px' }}>
                  <div>
                    <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Issued for</p>
                    <p style={{ marginTop: 0 }}>{user.enrollmentKey.intendedFor || 'Not recorded'}</p>
                  </div>
                  <div>
                    <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>National ID / Passport</p>
                    <p style={{ marginTop: 0 }}>{user.enrollmentKey.idNumber || 'Not recorded'}</p>
                  </div>
                  <div>
                    <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Key issued</p>
                    <p style={{ marginTop: 0 }}>{user.enrollmentKey.createdAt}</p>
                  </div>
                  <div>
                    <p className="muted" style={{ marginBottom: '2px', fontSize: '0.8rem' }}>Key redeemed</p>
                    <p style={{ marginTop: 0 }}>{user.enrollmentKey.usedAt || 'Not recorded'}</p>
                  </div>
                </div>

                {/* links to the CV and the certificates */}
                {!user.enrollmentKey.hasCv && user.enrollmentKey.certificateCount === 0 ? (
                  <p className="muted">No CV or certificates were uploaded with this key.</p>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {user.enrollmentKey.hasCv && (
                      <a
                        href={getTutorKeyDocumentUrl(user.enrollmentKey.id, 'cv')}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        View CV
                      </a>
                    )}
                    {Array.from({ length: user.enrollmentKey.certificateCount }).map((_, index) => (
                      <a
                        key={index}
                        href={getTutorKeyDocumentUrl(user.enrollmentKey.id, `certificate-${index}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Certificate {index + 1}
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default UserProfilePage;
