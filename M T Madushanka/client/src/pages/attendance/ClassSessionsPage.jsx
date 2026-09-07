// Tutor: pick a class session to mark
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchClassSessions } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';

// A class id is always a plain positive integer (see attendance.validation.js
// on the server). Rejecting anything else here - before it ever reaches
// navigate() - closes off open-redirect payloads smuggled through the URL's
// own :classId segment (e.g. a link containing "\\evil.com" as the id).
function isValidClassId(value) {
  return /^[1-9][0-9]*$/.test(String(value || ''));
}

function ClassSessionsPage() {
  const { classId: classIdParam } = useParams();
  const navigate = useNavigate();

  const [classIdInput, setClassIdInput] = useState(isValidClassId(classIdParam) ? classIdParam : '');
  const [classSubject, setClassSubject] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    if (isValidClassId(classIdParam)) {
      loadSessions(classIdParam);
    } else if (classIdParam) {
      setErrorMessage('Invalid class id in the URL.');
    }
  }, [classIdParam, loadSessions]);

  function handleFindClass(event) {
    event.preventDefault();
    if (!isValidClassId(classIdInput)) {
      setErrorMessage('Please enter a valid class id (a positive number).');
      return;
    }
    navigate(`/attendance/classes/${classIdInput}/sessions`);
  }

  return (
    <div className="page">
      <h1>Mark Attendance</h1>

      <div className="card">
        <form className="inline-form" onSubmit={handleFindClass}>
          <label htmlFor="classId">Class ID</label>
          <input
            id="classId"
            type="number"
            min="1"
            value={classIdInput}
            onChange={(e) => setClassIdInput(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary">
            Load sessions
          </button>
        </form>
      </div>

      <Alert type="error" message={errorMessage} />

      {isLoading && <LoadingSpinner label="Loading sessions..." />}

      {!isLoading && classIdParam && sessions.length === 0 && !errorMessage && (
        <p className="muted">This class has no scheduled sessions yet.</p>
      )}

      {!isLoading && sessions.length > 0 && (
        <div className="card">
          <h2>{classSubject}</h2>
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
                      className="btn btn-secondary"
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
      )}
    </div>
  );
}

export default ClassSessionsPage;
