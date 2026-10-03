// Tutor: view one of their own students' attendance history for a class (ATP-02)
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { fetchStudentAttendanceHistory } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import StatCard from '../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

// badge colour for Present, Late or Absent
function statusBadgeClass(status) {
  if (status === 'PRESENT') return 'badge badge-success';
  if (status === 'LATE') return 'badge badge-warning';
  return 'badge badge-danger';
}

// one student's attendance history in a class (tutor view)
function TutorStudentHistoryPage() {
  const { studentId } = useParams();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  const location = useLocation();
  // Passed from MarkAttendancePage's "View history" link
  const studentName = location.state && location.state.studentName;

  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // load the history for this student and class
  useEffect(() => {
    let isMounted = true;
    // needs the class id from the address
    async function load() {
      // this page is opened from a class's attendance list, which adds the class
      if (!classId) {
        setErrorMessage('Open a student from a class attendance list to see their history.');
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchStudentAttendanceHistory(studentId, classId);
        if (isMounted) setHistory(data.history);
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
  }, [studentId, classId]);

  // present or late counts as attended
  const presentCount = history.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  const absentCount = history.filter((r) => r.status === 'ABSENT').length;

  // the page - breadcrumb, stat cards and the session history
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        {/* breadcrumb back to the attendance list */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/attendance/classes">Mark Attendance</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">Student History</span>
        </nav>

        <div className="page-header">
          <h1>Student Attendance History</h1>
          <p className="muted">
            {studentName ? `${studentName} - past sessions for this class.` : 'Past sessions for this student in this class.'}
          </p>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading attendance history..." />
        ) : (
          <>
            {/* stat cards */}
            <div className="stat-grid stat-grid-2">
              <StatCard icon="checkCircle" label="Present / Late" value={presentCount} tone="success" />
              <StatCard icon="xCircle" label="Absent" value={absentCount} tone="danger" />
            </div>

            {/* session history table */}
            <div className="card">
              <h2>Session history</h2>
              {history.length === 0 ? (
                <p className="muted">No attendance has been recorded for this student yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr key={record.id}>
                          <td>{record.session_date}</td>
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

export default TutorStudentHistoryPage;
