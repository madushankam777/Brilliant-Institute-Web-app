// Tutor: mark/correct attendance for a session
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAttendanceSheet, saveAttendance, fetchSessionQrCode } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = ['PRESENT', 'LATE', 'ABSENT'];

const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent' };

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

  const [showQr, setShowQr] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrError, setQrError] = useState('');

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

  async function handleShowQr() {
    setShowQr(true);
    if (qrCodeDataUrl) return;
    setIsLoadingQr(true);
    setQrError('');
    try {
      const data = await fetchSessionQrCode(sessionId);
      setQrCodeDataUrl(data.qrCodeDataUrl);
    } catch (error) {
      setQrError(error.message);
    } finally {
      setIsLoadingQr(false);
    }
  }

  const filteredRows = rows.filter((row) =>
    row.studentName.toLowerCase().includes(search.trim().toLowerCase())
  );

  const counts = STATUS_OPTIONS.reduce((acc, status) => {
    acc[status] = rows.filter((row) => row.status === status).length;
    return acc;
  }, {});

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
          {sessionInfo && sessionInfo.isAdvancedLevel && sessionInfo.isToday && (
            <button type="button" className="btn btn-secondary" onClick={handleShowQr}>
              <Icon name="search" size={15} /> Show Self Check-In QR Code
            </button>
          )}
        </div>

        {showQr && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Self Check-In QR Code</h3>
            <Alert type="error" message={qrError} />
            {isLoadingQr ? (
              <LoadingSpinner label="Generating QR code..." />
            ) : (
              qrCodeDataUrl && <img src={qrCodeDataUrl} alt="Attendance check-in QR code" style={{ maxWidth: '260px' }} />
            )}
            <div>
              <button type="button" className="btn btn-link" onClick={() => setShowQr(false)}>
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
              <p className="muted">
                No paid, enrolled students yet - a student has to enrol and complete at least one
                payment before they appear here.
              </p>
            ) : (
              <form onSubmit={handleSave}>
                <div className="card">
                  <div className="form-field has-icon" style={{ marginBottom: '14px', maxWidth: '320px' }}>
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
