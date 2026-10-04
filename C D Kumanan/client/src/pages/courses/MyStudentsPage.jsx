// my students page - everyone in my classes, with suspend and reactivate
import { useCallback, useEffect, useState } from 'react';
import { fetchMyStudents, suspendUser, activateUser } from '../../api/adminApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';

// the side menu for a tutor
const NAV_ITEMS = getNavItems('TUTOR');

// badge colour for Active, Suspended or other
function statusBadgeClass(status) {
  if (status === 'ACTIVE') return 'badge badge-success';
  if (status === 'SUSPENDED') return 'badge badge-danger';
  return 'badge badge-neutral';
}

// my students - everyone in my classes; a tutor can suspend or reactivate them
function MyStudentsPage() {
  // the students and the page state
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null); // { student, action: 'suspend' | 'activate' }
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // load my students
  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchMyStudents();
      setStudents(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    // fail silently, not critical
    }
  }, []);

  // load them when the page opens
  useEffect(() => {
    load();
  }, [load]);

  // close the confirm pop-up and clear it
  function closeConfirmModal() {
    setConfirmTarget(null);
    setConfirmNameInput('');
    setConfirmError('');
  }

  // confirm btn - suspend or reactivate the student
  async function handleConfirm() {
    if (!confirmTarget) return;
    setIsConfirming(true);
    setConfirmError('');
    try {
      if (confirmTarget.action === 'suspend') {
        await suspendUser(confirmTarget.student.id, confirmNameInput);
      } else {
        await activateUser(confirmTarget.student.id);
      }
      closeConfirmModal();
      await load();
    } catch (error) {
      setConfirmError(error.message);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>My Students</h1>
          <p className="muted">
            Everyone currently enrolled in one of your classes. You can suspend or reactivate their
            account from here.
          </p>
        </div>

        <Alert type="error" message={errorMessage} />

        {/* a spinner, or the students table */}
        {isLoading ? (
          <LoadingSpinner label="Loading your students..." />
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Enrolled In</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar name={student.fullName} pictureUrl={student.profilePictureUrl} size={28} />
                          {student.fullName}
                        </div>
                      </td>
                      <td>{student.email}</td>
                      <td>{student.classNames}</td>
                      <td>
                        <span className={statusBadgeClass(student.status)}>{student.status}</span>
                      </td>
                      <td>
                        {/* suspend btn for active students, reactivate btn for the others */}
                        {student.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setConfirmTarget({ student, action: 'suspend' });
                              setConfirmNameInput('');
                              setConfirmError('');
                            }}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setConfirmTarget({ student, action: 'activate' });
                              setConfirmNameInput('');
                              setConfirmError('');
                            }}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {students.length === 0 && (
              <p className="muted">No students are enrolled in your classes yet.</p>
            )}
          </div>
        )}
      </div>

      {confirmTarget && (
        <div className="modal-overlay" onClick={() => !isConfirming && closeConfirmModal()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmTarget.action === 'suspend' ? 'Confirm Suspension' : 'Confirm Reactivation'}</h2>
            <p className="muted">
              Are you sure you want to {confirmTarget.action}{' '}
              <strong>{confirmTarget.student.fullName}</strong>?
              {confirmTarget.action === 'suspend' &&
                ' They will lose access to all classes, dashboards, and portal features instantly.'}
            </p>

            <Alert type="error" message={confirmError} />

            {/* name check - only for a suspension */}
            {confirmTarget.action === 'suspend' && (
              <div className="form-field">
                <label htmlFor="confirmSuspendName">
                  Type <strong>{confirmTarget.student.fullName.toUpperCase()}</strong> in capital letters to
                  confirm
                </label>
                <input
                  id="confirmSuspendName"
                  type="text"
                  autoComplete="off"
                  placeholder={confirmTarget.student.fullName.toUpperCase()}
                  value={confirmNameInput}
                  onChange={(e) => setConfirmNameInput(e.target.value)}
                />
              </div>
            )}

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" disabled={isConfirming} onClick={closeConfirmModal}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmTarget.action === 'suspend' ? 'btn btn-danger' : 'btn btn-primary'}
                disabled={
                  isConfirming ||
                  (confirmTarget.action === 'suspend' &&
                    confirmNameInput.trim() !== confirmTarget.student.fullName.toUpperCase())
                }
                onClick={handleConfirm}
              >
                {isConfirming
                  ? 'Please wait...'
                  : confirmTarget.action === 'suspend'
                    ? 'Confirm Suspend'
                    : 'Confirm Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default MyStudentsPage;
