// Student/Parent: attendance history + rate
import { useEffect, useState } from 'react';
import { fetchMyAttendanceHistory } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';

function statusBadgeClass(status) {
  if (status === 'PRESENT') return 'badge badge-success';
  if (status === 'LATE') return 'badge badge-warning';
  return 'badge badge-danger';
}

function AttendanceHistoryPage() {
  const [history, setHistory] = useState([]);
  const [summaryByClass, setSummaryByClass] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await fetchMyAttendanceHistory();
        if (isMounted) {
          setHistory(data.history);
          setSummaryByClass(data.summaryByClass);
        }
      } catch (error) {
        if (isMounted) setErrorMessage(error.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) return <LoadingSpinner label="Loading your attendance..." />;

  return (
    <div className="page">
      <h1>My Attendance</h1>
      <Alert type="error" message={errorMessage} />

      {summaryByClass.length > 0 && (
        <div className="card">
          <h2>Attendance rate by class</h2>
          <div className="summary-grid">
            {summaryByClass.map((summary) => (
              <div
                key={summary.classId}
                className={`summary-tile ${summary.isLowAttendance ? 'summary-tile-warning' : ''}`}
              >
                <h3>{summary.subject}</h3>
                <p className="summary-rate">{summary.attendanceRatePercent}%</p>
                <p className="muted">
                  {summary.attendedSessions} of {summary.totalSessions} sessions attended
                </p>
                {summary.isLowAttendance && (
                  <p className="warning-text">
                    Below the {summary.lowAttendanceThresholdPercent}% attendance threshold.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Session history</h2>
        {history.length === 0 ? (
          <p className="muted">No attendance has been recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id}>
                  <td>{record.session_date}</td>
                  <td>{record.subject}</td>
                  <td>
                    <span className={statusBadgeClass(record.status)}>{record.status}</span>
                  </td>
                  <td>{record.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AttendanceHistoryPage;
