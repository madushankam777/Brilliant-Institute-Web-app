// Tutor/Admin: "My Classes" - list, edit, cancel own classes (CRS-02, CRS-04)
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMyTaughtClasses, cancelClass } from '../../api/courseApi';
import { getOrCreateTodaySession } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function ManageClassesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const NAV_ITEMS = getNavItems(user.role);
  const isAdmin = user.role === 'ADMIN';

  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [openingAttendanceId, setOpeningAttendanceId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchMyTaughtClasses();
      setClasses(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(classId) {
    setCancellingId(classId);
    setErrorMessage('');
    try {
      await cancelClass(classId);
      setConfirmCancelId(null);
      await load();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setCancellingId(null);
    }
  }

  async function handleMarkAttendance(classId) {
    setOpeningAttendanceId(classId);
    setErrorMessage('');
    try {
      const sessionId = await getOrCreateTodaySession(classId);
      navigate(`/attendance/sessions/${sessionId}`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setOpeningAttendanceId(null);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>{isAdmin ? 'Manage Classes' : 'My Classes'}</h1>
            <p className="muted">
              {isAdmin
                ? 'Every class on the platform, across every Tutor - edit details or cancel a session series.'
                : 'Manage the classes you teach - edit details or cancel a session series.'}
            </p>
          </div>
          <Link to="/courses/manage/new" className="btn btn-primary">
            <Icon name="plus" size={16} /> Create Class
          </Link>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading your classes..." />
        ) : classes.length === 0 ? (
          <p className="muted">You have not created any classes yet.</p>
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    {isAdmin && <th>Tutor</th>}
                    <th>Schedule</th>
                    <th>Enrolled</th>
                    <th>Fee</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classItem) => (
                    <tr key={classItem.id}>
                      <td>
                        <Link to={`/courses/classes/${classItem.id}`} className="order-line-title" style={{ textDecoration: 'none' }}>
                          {classItem.subject}
                        </Link>
                        <div className="order-line-sub">{classItem.venue}</div>
                      </td>
                      {isAdmin && <td>{classItem.tutorName}</td>}
                      <td>
                        {classItem.dayOfWeek}, {classItem.startTime}-{classItem.endTime}
                      </td>
                      <td>
                        {classItem.enrolledCount}/{classItem.capacity}
                      </td>
                      <td>{formatCurrency(classItem.fee)}</td>
                      <td>
                        <span className={`badge ${classItem.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                          {classItem.status}
                        </span>
                      </td>
                      <td>
                        {classItem.status === 'ACTIVE' && (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={openingAttendanceId === classItem.id}
                              onClick={() => handleMarkAttendance(classItem.id)}
                            >
                              <Icon name="calendar" size={14} />{' '}
                              {openingAttendanceId === classItem.id ? 'Opening...' : 'Mark Attendance'}
                            </button>
                            <Link to={`/courses/manage/${classItem.id}/edit`} className="btn btn-secondary btn-sm">
                              <Icon name="edit" size={14} />
                            </Link>
                            {confirmCancelId === classItem.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={cancellingId === classItem.id}
                                  onClick={() => handleCancel(classItem.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setConfirmCancelId(null)}
                                >
                                  Keep
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setConfirmCancelId(classItem.id)}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default ManageClassesPage;
