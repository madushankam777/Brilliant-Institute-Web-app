// Tutor: mark/correct attendance for a session
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAttendanceSheet, saveAttendance, startSelfCheckIn } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

// the three marks a student can get
const STATUS_OPTIONS = ['PRESENT', 'LATE', 'ABSENT'];

// the words shown for each mark
const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent' };
const STATUS_BADGE = { PRESENT: 'badge-success', LATE: 'badge-warning', ABSENT: 'badge-danger' };

// attendance sheet
function MarkAttendancePage() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [sessionInfo, setSessionInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [search, setSearch] = useState('');

  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinExpiresAt, setCheckinExpiresAt] = useState('');
  const [isStartingCheckin, setIsStartingCheckin] = useState(false);
  const [checkinError, setCheckinError] = useState('');

  const loadSheet = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchAttendanceSheet(sessionId);
      setSessionInfo(data.session);
      setRows(data.students.map((student) => ({ ...student, status: student.status || null })));
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

  function markAllVisible(status) {
    const visibleIds = new Set(filteredRows.filter((row) => !row.status).map((row) => row.studentId));
    setRows((previousRows) =>
      previousRows.map((row) => (visibleIds.has(row.studentId) ? { ...row, status } : row))
    );
  }

  async function handleStartCheckin() {
    setShowCheckin(true);
    setIsStartingCheckin(true);
    setCheckinError('');
    try {
      const data = await startSelfCheckIn(sessionId);
      setCheckinCode(data.code);
      setCheckinExpiresAt(data.expiresAt);
    } catch (error) {
      setCheckinError(error.message);
    } finally {
      setIsStartingCheckin(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaveMessage('');
    setSaveError('');
    setIsSaving(true);

    const records = rows.filter((row) => row.status).map((row) => ({
      studentId: row.studentId,
      status: row.status,
      remarks: row.remarks,
    }));

    if (records.length === 0) {
      setSaveError('Nothing to save - mark at least one student first.');
      setIsSaving(false);
      return;
    }

    try {
      const data = await saveAttendance(sessionId, records);
      setRows(data.students.map((student) => ({ ...student, status: student.status || null })));
      const notMarked = data.students.filter((student) => !student.status).length;
      setSaveMessage(
        notMarked > 0
          ? `Attendance saved. ${notMarked} student(s) are still not marked.`
          : 'Attendance saved for every student.'
      );
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredRows = rows.filter((row) =>
    row.studentName.toLowerCase().includes(search.trim().toLowerCase())
  );

  const counts = STATUS_OPTIONS.reduce((acc, status) => {
    acc[status] = rows.filter((row) => row.status === status).length;
    return acc;
  }, {});
  counts.NOT_MARKED = rows.filter((row) => !row.status).length;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Mark Attendance</h1>
            {sessionInfo && (
              <p className="muted">
                {sessionInfo.subject} &middot; {sessionInfo.sessionDate} &middot; {sessionInfo.startTime}
                {' - '}
                {sessionInfo.endTime}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleStartCheckin}>
            <Icon name="lock" size={15} /> Generate Attendance Key
          </button>
        </div>

        {showCheckin && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Attendance Key</h3>
            <Alert type="error" message={checkinError} />
            {isStartingCheckin ? (
              <LoadingSpinner label="Generating key..." />
            ) : (
              checkinCode && (
                <>
                  <p style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '8px', margin: '10px 0' }}>
                    {checkinCode}
                  </p>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    Read this out to the class, or write it on the board. Students already enrolled
                    in this class can enter it from their own device to mark themselves Present. It
                    expires at {new Date(checkinExpiresAt).toLocaleTimeString()}.
                  </p>
                </>
              )
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isStartingCheckin}
                onClick={handleStartCheckin}
              >
                New Key
              </button>
              <button type="button" className="btn btn-link" onClick={() => setShowCheckin(false)}>
                Hide
              </button>
            </div>
          </div>
        )}

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
                  <div className="flex-between" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div className="form-field has-icon" style={{ margin: 0, maxWidth: '320px', flex: 1 }}>
                      <div className="input-shell">
                        <span className="input-icon">
                          <Icon name="search" size={16} />
                        </span>
                        <input
                          type="search"
                          placeholder="Search student by name..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => markAllVisible('PRESENT')}>
                        Mark rest Present
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => markAllVisible('ABSENT')}>
                        Mark rest Absent
                      </button>
                    </div>
                  </div>

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
                        {filteredRows.map((row) => (
                          <tr key={row.studentId}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar name={row.studentName} pictureUrl={row.profilePictureUrl} size={32} />
                                <div>
                                  <div>{row.studentName}</div>
                                  {row.studentCode && (
                                    <div className="muted" style={{ fontSize: '0.75rem' }}>{row.studentCode}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div
                                role="group"
                                aria-label={`Attendance status for ${row.studentName}`}
                                style={{ display: 'inline-flex', gap: '6px' }}
                              >
                                <button
                                  type="button"
                                  className="badge badge-neutral"
                                  aria-pressed={!row.status}
                                  disabled={row.alreadyMarked}
                                  title={row.alreadyMarked ? 'Already marked - choose Present, Late or Absent to change it' : undefined}
                                  style={{
                                    border: !row.status ? '1.5px dashed currentColor' : '1.5px solid transparent',
                                    cursor: row.alreadyMarked ? 'not-allowed' : 'pointer',
                                    padding: '4px 11px',
                                    opacity: !row.status ? 1 : 0.55,
                                    fontWeight: !row.status ? 700 : 600,
                                  }}
                                  onClick={() => updateRow(row.studentId, 'status', null)}
                                >
                                  Not marked
                                </button>
                                {STATUS_OPTIONS.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    aria-pressed={row.status === option}
                                    className={`badge ${row.status === option ? STATUS_BADGE[option] : 'badge-neutral'}`}
                                    style={{
                                      border: '1.5px solid transparent',
                                      cursor: 'pointer',
                                      padding: '4px 11px',
                                      opacity: row.status === option ? 1 : 0.55,
                                    }}
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
                        {filteredRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '16px' }}>
                              No students match &quot;{search}&quot;.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex-between" style={{ marginTop: '18px' }}>
                    <div style={{ display: 'flex', gap: '18px', fontSize: '0.85rem' }}>
                      <span>
                        <span className="badge badge-neutral">Not marked</span> {counts.NOT_MARKED}
                      </span>
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
