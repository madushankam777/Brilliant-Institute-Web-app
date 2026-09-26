// Admin: broadcast announcements (ADM-04) + trigger reminder batches (ADM-03)
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  fetchReminderCandidates,
  sendReminders,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';

const NAV_ITEMS = getNavItems('ADMIN');

const AUDIENCES = [
  { value: 'ALL', label: 'All Users' },
  { value: 'STUDENT_PARENT', label: 'Students & Parents' },
  { value: 'TUTOR', label: 'Tutors' },
];

const emptyForm = { title: '', body: '', priority: 'NORMAL', targetAudience: 'ALL', targetGrade: '' };

function AnnouncementsPage() {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');

  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [reminderType, setReminderType] = useState(null); // 'FEE_DUE' | 'LOW_ATTENDANCE' | null
  const [candidates, setCandidates] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState('');
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [reminderStatus, setReminderStatus] = useState('');
  const [reminderError, setReminderError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchAllAnnouncements();
      setAnnouncements(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function startEdit(announcement) {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      targetAudience: announcement.targetAudience,
      targetGrade: announcement.targetGrade || '',
    });
    setFormError('');
    setFormErrors({});
    setPublishSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setFormErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setPublishSuccess('');

    const errors = {};
    if (form.title.trim().length < 3) errors.title = 'Please enter a title.';
    if (form.body.trim().length < 3) errors.body = 'Please write the announcement message.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      title: form.title,
      body: form.body,
      priority: form.priority,
      targetAudience: form.targetAudience,
      targetGrade: form.targetAudience === 'TUTOR' ? '' : form.targetGrade,
    };

    setIsPublishing(true);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, payload);
        setPublishSuccess('Announcement updated - it will show as updated to everyone it reaches.');
      } else {
        await createAnnouncement(payload);
        setPublishSuccess('Announcement published successfully.');
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteAnnouncement(deleteTarget.id);
      if (editingId === deleteTarget.id) cancelEdit();
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  }

  // load who a reminder would reach
  async function handleOpenReminderType(type) {
    setReminderType(type);
    setReminderStatus('');
    setReminderError('');
    setCandidatesError('');
    setSelectedStudentIds([]);
    setIsLoadingCandidates(true);
    try {
      const data = await fetchReminderCandidates(type);
      setCandidates(data);
    } catch (error) {
      setCandidatesError(error.message);
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  function closeReminderPanel() {
    setReminderType(null);
    setCandidates([]);
    setSelectedStudentIds([]);
    setCandidatesError('');
  }

  function toggleCandidate(studentId) {
    setSelectedStudentIds((previous) =>
      previous.includes(studentId) ? previous.filter((id) => id !== studentId) : [...previous, studentId]
    );
  }

  function toggleSelectAllCandidates() {
    setSelectedStudentIds((previous) =>
      previous.length === candidates.length ? [] : candidates.map((c) => c.studentId)
    );
  }

  async function handleSendReminders() {
    if (!reminderType) return;
    setReminderError('');
    if (selectedStudentIds.length === 0) {
      setReminderError('Select at least one student, or check "Select all" below.');
      return;
    }

    setReminderStatus('');
    setIsSendingReminders(true);
    try {
      const result = await sendReminders({ type: reminderType, studentIds: selectedStudentIds });
      setReminderStatus(
        `Sent ${result.sentCount} of ${result.recipientCount} ${reminderType === 'FEE_DUE' ? 'fee-due' : 'low-attendance'} reminder(s). Recipients will see it in their notification bell.`
      );
      closeReminderPanel();
    } catch (error) {
      setReminderError(error.message);
    } finally {
      setIsSendingReminders(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Broadcast Announcement</h1>
          <p className="muted">Publish instant messages, notices, and reminders to your platform.</p>
        </div>

        <div className="checkout-grid">
          <div>
            <div className="card">
              <div className="flex-between">
                <h2>{editingId ? 'Edit Broadcast' : 'New Broadcast'}</h2>
                {editingId && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                    Cancel Edit
                  </button>
                )}
              </div>
              <Alert type="success" message={publishSuccess} />
              <Alert type="error" message={formError} />

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-field">
                  <label htmlFor="title">Announcement Title</label>
                  <input
                    id="title"
                    type="text"
                    placeholder="e.g. End of Semester Examinations Notice"
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                  />
                  {formErrors.title && <p className="field-error">{formErrors.title}</p>}
                </div>

                <div className="form-field">
                  <label>Target Audience</label>
                  <div className="choice-group" role="radiogroup">
                    {AUDIENCES.map((audience) => (
                      <label
                        key={audience.value}
                        className={`choice-pill${form.targetAudience === audience.value ? ' is-checked' : ''}`}
                      >
                        <input
                          type="radio"
                          name="targetAudience"
                          value={audience.value}
                          checked={form.targetAudience === audience.value}
                          onChange={() => updateField('targetAudience', audience.value)}
                        />
                        {audience.label}
                      </label>
                    ))}
                  </div>
                </div>

                {form.targetAudience !== 'TUTOR' && (
                  <div className="form-field">
                    <label htmlFor="targetGrade">Grade (optional)</label>
                    <select
                      id="targetGrade"
                      value={form.targetGrade}
                      onChange={(e) => updateField('targetGrade', e.target.value)}
                    >
                      <option value="">Every grade</option>
                      {GRADES.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                    <p className="field-help">
                      Narrow this notice to students of one grade (e.g. Grade 11 Maths exam notice). Leave as
                      "Every grade" to reach every student/parent in the chosen audience.
                    </p>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="priority">Priority</label>
                  <select id="priority" value={form.priority} onChange={(e) => updateField('priority', e.target.value)}>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High Priority</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="body">Message Body</label>
                  <textarea
                    id="body"
                    placeholder="Type your official message notice here..."
                    value={form.body}
                    onChange={(e) => updateField('body', e.target.value)}
                    style={{ minHeight: '120px' }}
                  />
                  {formErrors.body && <p className="field-error">{formErrors.body}</p>}
                </div>

                <button type="submit" className="btn btn-primary btn-block" disabled={isPublishing}>
                  {isPublishing
                    ? editingId
                      ? 'Saving...'
                      : 'Publishing...'
                    : editingId
                      ? 'Save Changes'
                      : 'Publish Announcement'}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>Send Reminders</h2>
              <p className="muted" style={{ fontSize: '0.88rem' }}>
                Pick a reminder type to see exactly who it would reach, then choose specific students or
                send to everyone in the list.
              </p>
              {reminderStatus && <Alert type="success" message={reminderStatus} />}
              {!reminderType && <Alert type="error" message={reminderError} />}

              {!reminderType ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => handleOpenReminderType('FEE_DUE')}>
                    <Icon name="wallet" size={16} /> Fee-Due Reminders
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenReminderType('LOW_ATTENDANCE')}
                  >
                    <Icon name="calendar" size={16} /> Low-Attendance Reminders
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex-between" style={{ marginBottom: '8px' }}>
                    <strong>
                      {reminderType === 'FEE_DUE' ? 'Students with an outstanding balance' : 'Students below the attendance threshold'}
                    </strong>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={closeReminderPanel}>
                      Cancel
                    </button>
                  </div>

                  <Alert type="error" message={candidatesError} />
                  <Alert type="error" message={reminderError} />

                  {isLoadingCandidates ? (
                    <LoadingSpinner label="Finding students..." />
                  ) : candidates.length === 0 ? (
                    <p className="muted">
                      {reminderType === 'FEE_DUE'
                        ? 'No students currently have an outstanding balance.'
                        : 'No students are currently below the attendance threshold.'}
                    </p>
                  ) : (
                    <>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--color-border-soft)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.length === candidates.length}
                          onChange={toggleSelectAllCandidates}
                        />
                        Select all ({candidates.length})
                      </label>

                      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                        {candidates.map((candidate) => (
                          <label
                            key={candidate.studentId}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '10px 0',
                              borderBottom: '1px solid var(--color-border-soft)',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{ marginTop: '3px' }}
                              checked={selectedStudentIds.includes(candidate.studentId)}
                              onChange={() => toggleCandidate(candidate.studentId)}
                            />
                            <span>
                              <span style={{ fontWeight: 600, display: 'block' }}>{candidate.fullName}</span>
                              <span className="muted" style={{ fontSize: '0.8rem' }}>{candidate.email}</span>
                              <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>
                                {candidate.details.join(' · ')}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        style={{ marginTop: '14px' }}
                        disabled={isSendingReminders}
                        onClick={handleSendReminders}
                      >
                        {isSendingReminders
                          ? 'Sending...'
                          : `Send to Selected (${selectedStudentIds.length})`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Recent Broadcasts</h2>
            <Alert type="error" message={loadError} />
            {isLoading ? (
              <LoadingSpinner label="Loading announcements..." />
            ) : announcements.length === 0 ? (
              <p className="muted">No announcements published yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {announcements.map((announcement) => (
                  <div key={announcement.id} style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '12px' }}>
                    <div className="flex-between" style={{ marginBottom: '2px', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700 }}>{announcement.title}</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {announcement.isUpdated && <span className="badge">Updated</span>}
                        {announcement.priority === 'HIGH' && <span className="badge badge-danger">High Priority</span>}
                      </div>
                    </div>
                    <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0' }}>{announcement.body}</p>
                    <div className="flex-between" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span className="badge badge-neutral">
                          {AUDIENCES.find((a) => a.value === announcement.targetAudience)?.label || announcement.targetAudience}
                        </span>
                        {announcement.targetGrade && <span className="badge badge-neutral">{announcement.targetGrade}</span>}
                      </div>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {announcement.isUpdated ? `Updated ${announcement.updatedAt}` : announcement.createdAt}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(announcement)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(announcement)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={() => setDeleteTarget(null)} disabled={isDeleting} />
            <h2>Remove Announcement</h2>
            <p className="muted">
              Remove <strong>{deleteTarget.title}</strong>? It will no longer be shown to anyone it was
              targeted at.
            </p>

            <Alert type="error" message={deleteError} />

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={isDeleting} onClick={handleConfirmDelete}>
                {isDeleting ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default AnnouncementsPage;
