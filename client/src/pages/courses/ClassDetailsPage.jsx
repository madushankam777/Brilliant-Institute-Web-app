// Any role: view full class details (CRS-01); Student/Parent: Enrol Now (CRS-03)
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchClassDetails, enrollInClass } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function ClassDetailsPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [classData, setClassData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchClassDetails(classId);
      setClassData(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEnroll() {
    setEnrollError('');
    setIsEnrolling(true);
    try {
      const enrollment = await enrollInClass(classId);
      // go straight to payment page
      navigate('/payments', { state: { enrollmentId: enrollment.enrollmentId } });
    } catch (error) {
      setEnrollError(error.message);
    } finally {
      setIsEnrolling(false);
    }
  }

  if (isLoading) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <LoadingSpinner label="Loading class details..." />
        </div>
      </PortalShell>
    );
  }

  if (loadError || !classData) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <Alert type="error" message={loadError || 'Class not found.'} />
          <Link to="/courses/classes" className="btn btn-secondary">
            Back to Browse Classes
          </Link>
        </div>
      </PortalShell>
    );
  }

  const isFull = classData.spotsLeft <= 0;
  const isCancelled = classData.status === 'CANCELLED';
  const capacityPercent = Math.min(
    100,
    Math.round((classData.enrolledCount / classData.capacity) * 100)
  );

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/courses/classes">Browse Classes</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{classData.subject}</span>
        </nav>

        <div className="checkout-grid">
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {classData.level && <span className="badge badge-neutral">{classData.level}</span>}
              <span className={`badge ${isCancelled ? 'badge-danger' : 'badge-success'}`}>
                {isCancelled ? 'Cancelled' : 'Ongoing Intake'}
              </span>
            </div>
            <h1>{classData.subject}</h1>
            <p className="muted">{classData.description || 'No description provided yet.'}</p>

            <div className="card">
              <h2>Intake Schedule</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Venue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{classData.dayOfWeek}</td>
                      <td>
                        {classData.startTime} - {classData.endTime}
                      </td>
                      <td>{classData.venue}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2>Fee Breakdown</h2>
              <div className="order-line">
                <span className="order-line-title">Monthly Tuition Fee</span>
                <span className="order-line-amount">{formatCurrency(classData.fee)}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="flex-between" style={{ marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Class Capacity</span>
                <span style={{ fontSize: '0.85rem' }}>
                  {classData.enrolledCount}/{classData.capacity} Enrolled
                </span>
              </div>
              <div className="progress-track" style={{ marginBottom: '10px' }}>
                <div
                  className="progress-fill"
                  style={{ width: `${capacityPercent}%`, background: isFull ? 'var(--color-danger)' : undefined }}
                />
              </div>
              <p className={isFull ? 'warning-text' : 'muted'} style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                {isCancelled
                  ? 'This class has been cancelled.'
                  : isFull
                  ? 'This class is full.'
                  : `Only ${classData.spotsLeft} open spot${classData.spotsLeft === 1 ? '' : 's'} remaining.`}
              </p>

              <Alert type="error" message={enrollError} />

              {user.role === 'STUDENT_PARENT' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={isFull || isCancelled || isEnrolling}
                  onClick={handleEnroll}
                >
                  {isEnrolling ? 'Enrolling...' : 'Enrol Now'}
                </button>
              ) : (
                (user.role === 'TUTOR' || user.role === 'ADMIN') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={() => navigate(`/courses/manage/${classData.id}/edit`)}
                  >
                    <Icon name="edit" size={16} /> Edit This Class
                  </button>
                )
              )}
            </div>

            <div className="card">
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>About the Tutor</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Avatar name={classData.tutorName} pictureUrl={classData.tutorProfilePictureUrl} size={44} />
                <div>
                  <div style={{ fontWeight: 700 }}>{classData.tutorName}</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>{classData.subjectArea} Tutor</div>
                </div>
              </div>
              <Link to={`/courses/tutors/${classData.tutorId}`} className="btn btn-secondary btn-sm btn-block">
                View Full Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

export default ClassDetailsPage;
