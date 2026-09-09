// Tutor: mark/correct attendance for a session
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAttendanceSheet, saveAttendance } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
];

const STATUS_OPTIONS = ['PRESENT', 'LATE', 'ABSENT'];

const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent' };

function initialsOf(fullName) {
  return (fullName || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function MarkAttendancePage() {
  const { sessionId } = useParams();

  const [sessionInfo, setSessionInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const loadSheet = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchAttendanceSheet(sessionId);
      setSessionInfo(data.session);
      // Default anyone not yet marked to PRESENT, which is the most
      // common case and saves the tutor clicking for every student.
      setRows(
        data.students.map((student) => ({
          ...student,
          status: student.status || 'PRESENT',
        }))
      );
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  function updateRow(studentId, field, value) {
    setRows((previousRows) =>
      previousRows.map((row) => (row.studentId === studentId ? { ...row, [field]: value } : row))
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaveMessage('');
    setSaveError('');
    setIsSaving(true);

    const records = rows.map((row) => ({
      studentId: row.studentId,
      status: row.status,
      remarks: row.remarks,
    }));

    try {
      const data = await saveAttendance(sessionId, records);
      setRows(data.students.map((student) => ({ ...student, status: student.status || 'PRESENT' })));
      setSaveMessage('Attendance saved successfully.');
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const counts = STATUS_OPTIONS.reduce((acc, status) => {
    acc[status] = rows.filter((row) => row.status === status).length;
    return acc;
  }, {});

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Mark Attendance</h1>
          {sessionInfo && (
            <p className="muted">
              {sessionInfo.subject} &middot; {sessionInfo.sessionDate} &middot; {sessionInfo.startTime}
              {' - '}
              {sessionInfo.endTime}
            </p>
          )}
        </div>

        {isLoading && <LoadingSpinner label="Loading attendance sheet..." />}
        {loadError && <Alert type="error" message={loadError} />}

        {!isLoading && !loadError && (
          <>
            <Alert type="success" message={saveMessage} />
            <Alert type="error" message={saveError} />

            {rows.length === 0 ? (
              <p className="muted">No students are enrolled in this class yet.</p>
            ) : (
              <form onSubmit={handleSave}>
                <div className="card">
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Status</th>
                          <th>Tutor Notes</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.studentId}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className="avatar-circle" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                                  {initialsOf(row.studentName)}
                                </span>
                                {row.studentName}
                              </div>
                            </td>
                            <td>
                              <div
                                role="group"
                                aria-label={`Attendance status for ${row.studentName}`}
                                style={{ display: 'inline-flex', gap: '6px' }}
                              >
                                {STATUS_OPTIONS.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    className={`badge${row.status === option ? ` badge-${option === 'PRESENT' ? 'success' : option === 'LATE' ? 'warning' : 'danger'}` : ' badge-neutral'}`}
                                    style={{ border: 'none', cursor: 'pointer', padding: '5px 12px' }}
                                    onClick={() => updateRow(row.studentId, 'status', option)}
                                  >
                                    {STATUS_LABEL[option]}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td>
                              <input
                                type="text"
                                aria-label={`Remarks for ${row.studentName}`}
                                placeholder="Add remark..."
                                value={row.remarks || ''}
                                maxLength={255}
                                onChange={(e) => updateRow(row.studentId, 'remarks', e.target.value)}
                                style={{ minWidth: '160px' }}
                              />
                            </td>
                            <td>
                              {sessionInfo && (
                                <Link
                                  to={`/attendance/students/${row.studentId}?classId=${sessionInfo.classId}`}
                                  state={{ studentName: row.studentName }}
                                  className="btn btn-secondary btn-sm"
                                >
                                  History
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex-between" style={{ marginTop: '18px' }}>
                    <div style={{ display: 'flex', gap: '18px', fontSize: '0.85rem' }}>
                      <span>
                        <span className="badge badge-success">Present</span> {counts.PRESENT}
                      </span>
                      <span>
                        <span className="badge badge-warning">Late</span> {counts.LATE}
                      </span>
                      <span>
                        <span className="badge badge-danger">Absent</span> {counts.ABSENT}
                      </span>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Submit Attendance'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default MarkAttendancePage;
