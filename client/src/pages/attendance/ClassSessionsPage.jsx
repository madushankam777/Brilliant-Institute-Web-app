// Tutor/Admin: pick a class (by name, not a raw id) to see its sessions and mark attendance.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchClassSessions } from '../../api/attendanceApi';
import { fetchMyTaughtClasses } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function ClassSessionsPage() {
  const { classId: classIdParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const isAdmin = user.role === 'ADMIN';

  const [classes, setClasses] = useState([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [classesError, setClassesError] = useState('');

  const [classSubject, setClassSubject] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    fetchMyTaughtClasses()
      .then((data) => {
        if (isMounted) setClasses(data);
      })
      .catch((error) => {
        if (isMounted) setClassesError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingClasses(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const loadSessions = useCallback(async (classId) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchClassSessions(classId);
      setClassSubject(data.classSubject);
      setSessions(data.sessions);
    } catch (error) {
      setErrorMessage(error.message);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (classIdParam) {
      loadSessions(classIdParam);
    }
  }, [classIdParam, loadSessions]);

  function handleSelectClass(event) {
    const selectedId = event.target.value;
    if (!selectedId) {
      navigate('/attendance/classes');
      return;
    }
    navigate(`/attendance/classes/${selectedId}/sessions`);
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Mark Attendance</h1>
          <p className="muted">
            {isAdmin
              ? 'Pick a class to see its scheduled sessions.'
              : 'Pick one of your classes to see its scheduled sessions.'}
          </p>
        </div>

        <div className="card">
          <Alert type="error" message={classesError} />
          {isLoadingClasses ? (
            <LoadingSpinner label="Loading your classes..." />
          ) : classes.length === 0 ? (
            <p className="muted">
              {isAdmin
                ? 'No classes have been created yet.'
                : 'You have not created any classes yet - head to My Classes to create one.'}
            </p>
          ) : (
            <div className="form-field" style={{ maxWidth: '420px' }}>
              <label htmlFor="classPicker">Class</label>
              <select id="classPicker" value={classIdParam || ''} onChange={handleSelectClass}>
                <option value="">Select a class...</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.subject} &middot; {classItem.dayOfWeek} {classItem.startTime}-
                    {classItem.endTime}
                    {isAdmin ? ` (${classItem.tutorName})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading && <LoadingSpinner label="Loading sessions..." />}

        {!isLoading && classIdParam && sessions.length === 0 && !errorMessage && (
          <p className="muted">This class has no scheduled sessions yet.</p>
        )}

        {!isLoading && sessions.length > 0 && (
          <div className="card">
            <h2>{classSubject}</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.session_date}</td>
                      <td>
                        {session.start_time} - {session.end_time}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/attendance/sessions/${session.id}`)}
                        >
                          Open attendance sheet
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
