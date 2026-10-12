// Student/Parent: attendance history + rate
import { useEffect, useState } from 'react';
import { fetchMyAttendanceHistory } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import StatCard from '../../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';

const NAV_ITEMS = getNavItems('STUDENT_PARENT');

// badge colour for Present, Late or Absent
function statusBadgeClass(status) {
  if (status === 'PRESENT') return 'badge badge-success';
  if (status === 'LATE') return 'badge badge-warning';
  return 'badge badge-danger';
}

// my attendance
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

  const presentCount = history.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  const absentCount = history.filter((r) => r.status === 'ABSENT').length;
  const lowAttendanceClasses = summaryByClass.filter((s) => s.isLowAttendance);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Attendance History</h1>
          <p className="muted">Monitor your class attendance rate and view past session records.</p>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading your attendance..." />
        ) : (
          <>
            {lowAttendanceClasses.map((summary) => (
              <Alert
                key={summary.classId}
                type="warning"
                message={`Your attendance for ${summary.subject} is below ${summary.lowAttendanceThresholdPercent}% (currently ${summary.attendanceRatePercent}%). Please contact your tutor if you need to submit a justification.`}
              />
            ))}

            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <StatCard icon="calendar" label="Total Sessions" value={history.length} />
              <StatCard icon="checkCircle" label="Present Sessions" value={presentCount} tone="success" />
              <StatCard icon="xCircle" label="Absent Sessions" value={absentCount} tone="danger" />
            </div>

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
                <div className="table-scroll">
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
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default AttendanceHistoryPage;
