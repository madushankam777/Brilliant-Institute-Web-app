// Tutor: send a notice to their own students and/or Admin.
import { useCallback, useEffect, useState } from 'react';
import { fetchMyClassesForMessaging, sendTutorMessage } from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

const AUDIENCES = [
  { value: 'STUDENTS', label: 'My students', hint: 'Everyone actively enrolled in your classes.' },
  { value: 'ADMIN', label: 'Admin', hint: 'The institute office only.' },
  { value: 'BOTH', label: 'Students + Admin', hint: 'Both of the above.' },
];

const EMPTY_FORM = { audience: 'STUDENTS', classId: '', subject: '', message: '' };

function NotifyStudentsPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setClasses(await fetchMyClassesForMessaging());
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

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const errors = {};
    if (form.subject.trim().length < 3) errors.subject = 'Give your notice a short subject.';
    if (form.message.trim().length < 3) errors.message = 'Please write your message.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSending(true);
    try {
      const response = await sendTutorMessage({
        audience: form.audience,
        classId: form.audience === 'ADMIN' ? undefined : form.classId || undefined,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setSuccessMessage(response.message);
      setForm({ ...EMPTY_FORM, audience: form.audience });
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setFieldErrors(mapped);
        setFormError('');
      } else {
        setFormError(error.message);
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Notify Students</h1>
          <p className="muted">
            Send a notice straight to the notification bell of the students in your classes, the
            institute office, or both.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading your classes..." />
        ) : (
          <div className="card">
            <Alert type="success" message={successMessage} />
            <Alert type="error" message={formError} />

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-field">
                <label>Send to</label>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {AUDIENCES.map((audience) => (
                    <label
                      key={audience.value}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 500 }}
                    >
                      <input
                        type="radio"
                        name="audience"
                        value={audience.value}
                        checked={form.audience === audience.value}
                        onChange={() => updateField('audience', audience.value)}
                      />
                      {audience.label}
                    </label>
                  ))}
                </div>
                <p className="field-help">
                  {AUDIENCES.find((a) => a.value === form.audience)?.hint}
                </p>
              </div>

              {form.audience !== 'ADMIN' && (
                <div className="form-field">
                  <label htmlFor="notify-class">Class (optional)</label>
                  <select
                    id="notify-class"
                    value={form.classId}
                    onChange={(e) => updateField('classId', e.target.value)}
                  >
                    <option value="">All of my classes</option>
                    {classes.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.subject}
                        {classItem.level ? ` - ${classItem.level}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="field-help">
                    Narrow this to one class, or leave as &quot;All of my classes&quot; to reach every
                    student you teach.
                  </p>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="notify-subject">Subject</label>
                <input
                  id="notify-subject"
                  type="text"
                  placeholder="e.g. Room change for Saturday"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                />
                {fieldErrors.subject && <p className="field-error">{fieldErrors.subject}</p>}
              </div>

              <div className="form-field">
                <label htmlFor="notify-message">Message</label>
                <textarea
                  id="notify-message"
                  placeholder="Write the notice your students will see..."
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  maxLength={350}
                  style={{ minHeight: '110px' }}
                />
                <p className="field-help">{form.message.length}/350</p>
                {fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
              </div>

              <button type="submit" className="btn btn-primary" disabled={isSending}>
                {isSending ? 'Sending...' : 'Send notification'}
              </button>
            </form>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default NotifyStudentsPage;
