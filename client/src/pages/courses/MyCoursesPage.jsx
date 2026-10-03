// Student/Parent: "My Courses" - view enrolled classes, drop one (CRS-03)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyCourses, dropCourse, enrollInClass, deleteEnrollmentRecord } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { formatTimeRange } from '../../../../shared/client/src/utils/schedule';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';

// the side menu for a student
const NAV_ITEMS = getNavItems('STUDENT_PARENT');

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// my courses - active enrolments, past ones, drop, re-enrol and remove from history
function MyCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [droppingId, setDroppingId] = useState(null);
  const [confirmDropId, setConfirmDropId] = useState(null);
  const [reEnrollingId, setReEnrollingId] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null); // the course being permanently removed
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // load my enrolments
  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchMyCourses();
      setCourses(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // load them when the page opens
  useEffect(() => {
    load();
  }, [load]);

  // drop btn - leave a class (the payment history stays)
  async function handleDrop(enrollmentId) {
    setDroppingId(enrollmentId);
    setErrorMessage('');
    try {
      await dropCourse(enrollmentId);
      setConfirmDropId(null);
      await load();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setDroppingId(null);
    }
  }

  // re-add btn - join a class I dropped before
  async function handleReEnroll(course) {
    setReEnrollingId(course.enrollmentId);
    setErrorMessage('');
    try {
      await enrollInClass(course.classId);
      await load();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setReEnrollingId(null);
    }
  }

  // delete btn - open the confirm pop-up
  function openDeleteModal(course) {
    setDeleteTarget(course);
    setDeleteConfirmText('');
    setDeleteError('');
  }

  // close the confirm pop-up
  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteConfirmText('');
    setDeleteError('');
  }

  // confirm btn - remove the dropped class from my history (DELETE must be typed)
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteEnrollmentRecord(deleteTarget.enrollmentId);
      closeDeleteModal();
      await load();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  }

  // enrolments I am still in, and past ones (dropped or cancelled)
  const activeCourses = courses.filter((c) => c.enrollmentStatus === 'ACTIVE');
  const pastCourses = courses.filter((c) => c.enrollmentStatus !== 'ACTIVE');

  // the page - active enrolments, past enrolments and the remove pop-up
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>My Courses</h1>
          <p className="muted">Classes you are currently enrolled in, and your enrolment history.</p>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading your courses..." />
        ) : (
          <>
            {/* active enrolments */}
            <div className="card">
              <h2>Active enrolments</h2>
              {activeCourses.length === 0 ? (
                <p className="muted">
                  You are not enrolled in any class yet. <Link to="/courses/classes">Browse classes</Link> to get started.
                </p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Tutor</th>
                        <th>Schedule</th>
                        <th>Balance</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCourses.map((course) => (
                        <tr key={course.enrollmentId}>
                          <td>
                            <Link to={`/courses/classes/${course.classId}`} className="order-line-title" style={{ textDecoration: 'none' }}>
                              {course.subject}
                            </Link>
                            {course.classStatus === 'CANCELLED' && (
                              <div className="order-line-sub" style={{ color: 'var(--color-danger)' }}>
                                This class has been cancelled by the tutor.
                              </div>
                            )}
                          </td>
                          <td>{course.tutorName}</td>
                          <td>
                            {course.dayOfWeek}, {formatTimeRange(course.startTime, course.endTime)}
                          </td>
                          <td>{formatCurrency(course.balance)}</td>
                          <td>
                            {confirmDropId === course.enrollmentId ? (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={droppingId === course.enrollmentId}
                                  onClick={() => handleDrop(course.enrollmentId)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setConfirmDropId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setConfirmDropId(course.enrollmentId)}
                              >
                                Drop
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {pastCourses.length > 0 && (
              <div className="card">
                <h2>Past enrolments</h2>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  Dropped a class by accident? Re-enrol it below. No longer need it in your history at
                  all? Remove it permanently.
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Tutor</th>
                        <th>Dropped on</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastCourses.map((course) => {
                        const classUnavailable = course.classStatus === 'CANCELLED';
                        return (
                          <tr key={course.enrollmentId}>
                            <td>
                              {course.subject}
                              {classUnavailable && (
                                <div className="order-line-sub" style={{ color: 'var(--color-danger)' }}>
                                  This class has been cancelled by the tutor.
                                </div>
                              )}
                            </td>
                            <td>{course.tutorName}</td>
                            <td>{course.dropDate || '-'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={classUnavailable || reEnrollingId === course.enrollmentId}
                                  onClick={() => handleReEnroll(course)}
                                >
                                  {reEnrollingId === course.enrollmentId ? 'Re-enrolling...' : 'Re-enrol'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => openDeleteModal(course)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* remove from history pop-up */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !isDeleting && closeDeleteModal()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={closeDeleteModal} disabled={isDeleting} />
            <h2>Remove From History</h2>
            <p className="muted">
              This permanently removes <strong>{deleteTarget.subject}</strong> from your course history.
              This cannot be undone. Type <strong>DELETE</strong> below to confirm.
            </p>

            <div className="form-field">
              <label htmlFor="deleteConfirmText">Type DELETE to confirm</label>
              <input
                id="deleteConfirmText"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>

            <Alert type="error" message={deleteError} />

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" disabled={isDeleting} onClick={closeDeleteModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? 'Removing...' : 'Permanently Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default MyCoursesPage;
