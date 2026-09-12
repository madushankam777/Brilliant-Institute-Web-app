// Admin: broadcast announcements (ADM-04) + trigger reminder batches (ADM-03)
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  sendReminders,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';

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

  const [reminderStatus, setReminderStatus] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [sendingType, setSendingType] = useState(null);

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

  async function handleSendReminders(type) {
    setReminderError('');
    setReminderStatus('');
    setSendingType(type);
    try {
      const result = await sendReminders(type);
      setReminderStatus(`Sent ${result.sentCount} of ${result.recipientCount} ${type === 'FEE_DUE' ? 'fee-due' : 'low-attendance'} reminder(s).`);
    } catch (error) {
      setReminderError(error.message);
    } finally {
      setSendingType(null);
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
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    {AUDIENCES.map((audience) => (
                      <label key={audience.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 500 }}>
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
                Notify every student with an outstanding balance or attendance below the configured threshold.
              </p>
              {reminderStatus && <Alert type="success" message={reminderStatus} />}
              <Alert type="error" message={reminderError} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sendingType !== null}
                  onClick={() => handleSendReminders('FEE_DUE')}
                >
                  <Icon name="wallet" size={16} /> {sendingType === 'FEE_DUE' ? 'Sending...' : 'Fee-Due Reminders'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sendingType !== null}
                  onClick={() => handleSendReminders('LOW_ATTENDANCE')}
                >
                  <Icon name="calendar" size={16} /> {sendingType === 'LOW_ATTENDANCE' ? 'Sending...' : 'Low-Attendance Reminders'}
                </button>
              </div>
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
