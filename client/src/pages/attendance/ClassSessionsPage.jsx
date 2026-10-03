// Tutor/Admin: one click, mark today's attendance
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrCreateTodaySession } from '../../api/attendanceApi';
import { fetchMyTaughtClasses } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';
import { formatTimeRange } from '../../../../shared/client/src/utils/schedule';

// mark attendance page - the classes I teach, one click opens today's attendance sheet
function ClassSessionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const isAdmin = user.role === 'ADMIN';

  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState('');

  // load the classes I teach
  useEffect(() => {
    let isMounted = true;
    fetchMyTaughtClasses()
      .then((data) => {
        if (isMounted) setClasses(data);
      })
      .catch((error) => {
        if (isMounted) setLoadError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // mark attendance btn
  async function handleMarkToday(classId) {
    setOpenError('');
    setOpeningId(classId);
    try {
      const sessionId = await getOrCreateTodaySession(classId);
      navigate(`/attendance/sessions/${sessionId}`);
    } catch (error) {
      setOpenError(error.message);
      setOpeningId(null);
    }
  }

  // the page - the classes table with a Mark attendance button on each class
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Mark Attendance</h1>
          <p className="muted">
            {isAdmin
              ? "Pick a class to mark today's attendance."
              : "Pick one of your classes to mark today's attendance."}
          </p>
        </div>

        <Alert type="error" message={loadError} />
        <Alert type="error" message={openError} />

        {isLoading ? (
          <LoadingSpinner label="Loading your classes..." />
        ) : classes.length === 0 ? (
          <p className="muted">
            {isAdmin
              ? 'No classes have been created yet.'
              : 'You have not been assigned any classes yet - head to My Classes to create one.'}
          </p>
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Schedule</th>
                    {isAdmin && <th>Tutor</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classItem) => (
                    <tr key={classItem.id}>
                      <td>{classItem.subject}</td>
                      <td>
                        {classItem.dayOfWeek}, {formatTimeRange(classItem.startTime, classItem.endTime)}
                      </td>
                      {isAdmin && <td>{classItem.tutorName}</td>}
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={openingId === classItem.id}
                          onClick={() => handleMarkToday(classItem.id)}
                        >
                          <Icon name="calendar" size={14} />{' '}
                          {openingId === classItem.id ? 'Opening...' : "Mark Today's Attendance"}
                        </button>
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

export default ClassSessionsPage;
