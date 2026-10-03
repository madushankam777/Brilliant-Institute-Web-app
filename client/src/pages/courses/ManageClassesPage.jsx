// Tutor/Admin: "My Classes" - list, edit, cancel own classes (CRS-02, CRS-04)
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMyTaughtClasses, cancelClass } from '../../api/courseApi';
import { getOrCreateTodaySession } from '../../api/attendanceApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { formatLongDate, formatTimeRange, todayKey } from '../../../../shared/client/src/utils/schedule';
import { useAuth } from '../../context/AuthContext';
import ExtraClassModal from './ExtraClassModal';
import CancelClassDayModal from './CancelClassDayModal';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// manage classes - a tutor's own classes (an admin sees all) with attendance, extra class, cancel and edit
function ManageClassesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const NAV_ITEMS = getNavItems(user.role);
  const isAdmin = user.role === 'ADMIN';

  // the classes and the page state
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [openingAttendanceId, setOpeningAttendanceId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  // { type: 'extra' | 'cancelDay', classItem } while a dialog is open
  const [dialog, setDialog] = useState(null);

  // load the classes
  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchMyTaughtClasses();
      setClasses(data);
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

  // cancel class btn - cancel the whole class, then reload the list
  async function handleCancel(classId) {
    setCancellingId(classId);
    setErrorMessage('');
    try {
      await cancelClass(classId);
      setConfirmCancelId(null);
      await load();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setCancellingId(null);
    }
  }

  // after a pop-up saves - close it and show the message
  function handleDialogSaved(message) {
    setDialog(null);
    setSuccessMessage(`${message} Enrolled students have been notified.`);
  }

  // mark attendance btn - open today's attendance sheet for the class
  async function handleMarkAttendance(classId) {
    setOpeningAttendanceId(classId);
    setErrorMessage('');
    try {
      const sessionId = await getOrCreateTodaySession(classId);
      navigate(`/attendance/sessions/${sessionId}`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setOpeningAttendanceId(null);
    }
  }

  // the page - header, messages, the classes table and the two pop-ups
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>{isAdmin ? 'Manage Classes' : 'My Classes'}</h1>
            <p className="muted">
              {isAdmin
                ? 'Every class on the platform, across every Tutor - edit details, add extra classes or cancel a date.'
                : 'Manage the classes you teach - edit details, add extra classes or cancel a date.'}
            </p>
          </div>
          {/* admin only - class report and create class buttons */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <ReportLink type="classes" label="Class report" />
              <Link to="/courses/manage/new" className="btn btn-primary">
                <Icon name="plus" size={16} /> Create Class
              </Link>
            </div>
          )}
        </div>

        {/* error and success messages */}
        <Alert type="error" message={errorMessage} />
        <Alert type="success" message={successMessage} />

        {/* a spinner, an empty message, or the classes table */}
        {isLoading ? (
          <LoadingSpinner label="Loading your classes..." />
        ) : classes.length === 0 ? (
          <p className="muted">
            {isAdmin
              ? 'No classes have been created yet.'
              : 'No classes have been assigned to you yet - an Admin creates classes and assigns them to Tutors.'}
          </p>
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    {isAdmin && <th>Tutor</th>}
                    <th>Schedule</th>
                    <th>Enrolled</th>
                    <th>Fee</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classItem) => (
                    <tr key={classItem.id}>
                      <td>
                        <Link to={`/courses/classes/${classItem.id}`} className="order-line-title" style={{ textDecoration: 'none' }}>
                          {classItem.subject}
                        </Link>
                        <div className="order-line-sub">{classItem.venue}</div>
                      </td>
                      {isAdmin && <td>{classItem.tutorName}</td>}
                      <td>
                        {classItem.dayOfWeek}
                        <div className="order-line-sub">
                          {formatTimeRange(classItem.startTime, classItem.endTime)}
                          {classItem.startDate && classItem.startDate > todayKey()
                            ? ` · starts ${formatLongDate(classItem.startDate)}`
                            : ''}
                        </div>
                      </td>
                      <td>
                        {classItem.enrolledCount}/{classItem.capacity}
                      </td>
                      <td>{formatCurrency(classItem.fee)}</td>
                      <td>
                        <span className={`badge ${classItem.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                          {classItem.status}
                        </span>
                      </td>
                      <td>
                        {/* row buttons - only for active classes */}
                        {classItem.status === 'ACTIVE' && (
                          <div className="class-row-actions">
                            {/* mark attendance btn - opens today's attendance sheet */}
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={openingAttendanceId === classItem.id}
                              onClick={() => handleMarkAttendance(classItem.id)}
                            >
                              <Icon name="calendar" size={14} />{' '}
                              {openingAttendanceId === classItem.id ? 'Opening...' : 'Mark Attendance'}
                            </button>
                            {/* extra class btn - opens the extra class pop-up */}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSuccessMessage('');
                                setDialog({ type: 'extra', classItem });
                              }}
                            >
                              <Icon name="plus" size={14} /> Extra class
                            </button>
                            {/* cancel a date btn - opens the cancel a date pop-up */}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSuccessMessage('');
                                setDialog({ type: 'cancelDay', classItem });
                              }}
                            >
                              <Icon name="calendarDays" size={14} /> Cancel a date
                            </button>
                            {/* edit btn - goes to the edit class page */}
                            <Link
                              to={`/courses/manage/${classItem.id}/edit`}
                              className="btn btn-secondary btn-sm"
                              aria-label={`Edit ${classItem.subject}`}
                            >
                              <Icon name="edit" size={14} />
                            </Link>
                            {/* cancel class btn - asks Confirm or Keep first */}
                            {confirmCancelId === classItem.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={cancellingId === classItem.id}
                                  onClick={() => handleCancel(classItem.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setConfirmCancelId(null)}
                                >
                                  Keep
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setConfirmCancelId(classItem.id)}
                                aria-label={`Cancel ${classItem.subject} for good`}
                                title="Cancel the whole class"
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* extra class pop-up */}
      {dialog && dialog.type === 'extra' && (
        <ExtraClassModal classItem={dialog.classItem} onClose={() => setDialog(null)} onSaved={handleDialogSaved} />
      )}
      {/* cancel a date pop-up */}
      {dialog && dialog.type === 'cancelDay' && (
        <CancelClassDayModal classItem={dialog.classItem} onClose={() => setDialog(null)} onSaved={handleDialogSaved} />
      )}
    </PortalShell>
  );
}

export default ManageClassesPage;
