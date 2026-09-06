// Tutor: mark/correct attendance for a session
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchAttendanceSheet, saveAttendance } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';

const STATUS_OPTIONS = ['PRESENT', 'ABSENT', 'LATE'];

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

  if (isLoading) return <LoadingSpinner label="Loading attendance sheet..." />;
  if (loadError) return <Alert type="error" message={loadError} />;

  return (
    <div className="page">
      <h1>Attendance Sheet</h1>
      {sessionInfo && (
        <p className="muted">
          {sessionInfo.subject} &middot; {sessionInfo.sessionDate} &middot; {sessionInfo.startTime}
          {' - '}
          {sessionInfo.endTime}
        </p>
      )}

      <Alert type="success" message={saveMessage} />
      <Alert type="error" message={saveError} />

      {rows.length === 0 ? (
        <p className="muted">No students are enrolled in this class yet.</p>
      ) : (
        <form onSubmit={handleSave}>
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Already marked?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.studentName}</td>
                    <td>
                      <select
                        aria-label={`Attendance status for ${row.studentName}`}
                        value={row.status}
                        onChange={(e) => updateRow(row.studentId, 'status', e.target.value)}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Remarks for ${row.studentName}`}
                        value={row.remarks || ''}
                        maxLength={255}
                        onChange={(e) => updateRow(row.studentId, 'remarks', e.target.value)}
                      />
                    </td>
                    <td>{row.alreadyMarked ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save attendance'}
          </button>
        </form>
      )}
    </div>
  );
}

export default MarkAttendancePage;
