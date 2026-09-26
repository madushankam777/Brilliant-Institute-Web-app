// Tutor profile page - bio and classes
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTutorProfile } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';
import { formatTimeRange } from '../../../../shared/client/src/utils/schedule';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function TutorProfilePage() {
  const { tutorId } = useParams();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [tutor, setTutor] = useState(null);
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchTutorProfile(tutorId);
      setTutor(data.tutor);
      setClasses(data.classes);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tutorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <LoadingSpinner label="Loading tutor profile..." />
        </div>
      </PortalShell>
    );
  }

  if (loadError || !tutor) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <Alert type="error" message={loadError || 'Tutor not found.'} />
          <Link to="/courses/classes" className="btn btn-secondary">
            Back to Browse Classes
          </Link>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/courses/classes">Browse Classes</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{tutor.fullName}</span>
        </nav>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: tutor.bio ? '18px' : 0 }}>
            <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={64} />
            <div>
              <h1 style={{ marginBottom: '2px' }}>{tutor.fullName}</h1>
              <p className="muted" style={{ margin: 0 }}>Tutor at Brilliant Institute</p>
            </div>
          </div>
          {tutor.bio && <p style={{ marginBottom: 0 }}>{tutor.bio}</p>}
        </div>

        <div className="card">
          <h2>Classes Taught</h2>
          {classes.length === 0 ? (
            <p className="muted">This tutor has no active classes right now.</p>
          ) : (
            <div className="feature-grid">
              {classes.map((classItem) => (
                <div key={classItem.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="flex-between" style={{ marginBottom: '8px' }}>
                    <span className="badge badge-neutral">{classItem.subjectArea}</span>
                    <span className={`badge ${classItem.spotsLeft <= 5 ? 'badge-warning' : 'badge-success'}`}>
                      {classItem.spotsLeft} spots left
                    </span>
                  </div>
                  <h3 style={{ marginBottom: '4px' }}>{classItem.subject}</h3>
                  <p className="muted" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                    <Icon name="calendar" size={14} /> {classItem.dayOfWeek}, {formatTimeRange(classItem.startTime, classItem.endTime)}
                  </p>
                  <div className="flex-between">
                    <div style={{ fontWeight: 700 }}>{formatCurrency(classItem.fee)}/month</div>
                    <Link to={`/courses/classes/${classItem.id}`} className="btn btn-secondary btn-sm">
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export default TutorProfilePage;
