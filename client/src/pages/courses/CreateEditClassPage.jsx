// Tutor/Admin: create or edit a class, with CRS-05 conflict detection.
// One route handles both modes - "new" (no :classId) vs "edit" (:classId set).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createClass, updateClass, fetchClassDetails, fetchAllTutors } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { useAuth } from '../../context/AuthContext';

const SUBJECT_AREAS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English', 'Other'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const emptyForm = {
  subject: '',
  subjectArea: 'Mathematics',
  description: '',
  level: GRADES[0],
  venue: '',
  dayOfWeek: 'Monday',
  startTime: '15:00',
  endTime: '16:30',
  capacity: 30,
  fee: '',
  tutorId: null,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

// Mirrors the server's own rules so a mistake is caught before the request
// goes out - the server still re-checks everything.
function validateClassForm(form, { requireTutor }) {
  const capacity = Number(form.capacity);
  const fee = Number(form.fee);
  const subject = form.subject.trim();
  const venue = form.venue.trim();

  return {
    tutorId: requireTutor && !form.tutorId && 'Choose which tutor teaches this class.',
    subject:
      (!subject && 'Enter a subject name.') ||
      (subject.length < 3 && 'Subject name must be at least 3 characters.') ||
      (subject.length > 150 && 'Subject name must be 150 characters or fewer.'),
    venue:
      (!venue && 'Enter the venue or classroom.') ||
      (venue.length > 150 && 'Venue must be 150 characters or fewer.'),
    description:
      form.description.length > 2000 && 'Description must be 2000 characters or fewer.',
    startTime: !TIME_PATTERN.test(form.startTime) && 'Enter a start time.',
    endTime:
      (!TIME_PATTERN.test(form.endTime) && 'Enter an end time.') ||
      (TIME_PATTERN.test(form.startTime) &&
        toMinutes(form.endTime) <= toMinutes(form.startTime) &&
        'End time must be after the start time.'),
    capacity:
      (form.capacity === '' && 'Enter how many seats this class has.') ||
      (!Number.isInteger(capacity) && 'Capacity must be a whole number.') ||
      (capacity < 1 && 'Capacity must be at least 1.') ||
      (capacity > 500 && 'Capacity cannot be more than 500.'),
    fee:
      (form.fee === '' && 'Enter the monthly fee.') ||
      (Number.isNaN(fee) && 'Fee must be a number.') ||
      (fee < 0 && 'Fee cannot be negative.'),
  };
}

function computeDuration(startTime, endTime) {
  if (!startTime || !endTime) return '-';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours > 0 ? `${hours}h ` : ''}${remainder > 0 ? `${remainder}m` : ''}`.trim() || '0m';
}

function CreateEditClassPage() {
  const { classId } = useParams();
  const isEditMode = Boolean(classId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const isAdmin = user.role === 'ADMIN';

  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearErrors, clearFieldError } = useFormErrors();
  const [warnings, setWarnings] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');

  const [tutors, setTutors] = useState([]);
  const [tutorsError, setTutorsError] = useState('');

  const loadExisting = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchClassDetails(classId);
      setForm({
        subject: data.subject,
        subjectArea: data.subjectArea || 'Mathematics',
        description: data.description || '',
        level: data.level || GRADES[0],
        venue: data.venue || '',
        dayOfWeek: data.dayOfWeek || 'Monday',
        startTime: (data.startTime || '15:00:00').slice(0, 5),
        endTime: (data.endTime || '16:30:00').slice(0, 5),
        capacity: data.capacity,
        fee: data.fee,
        tutorId: data.tutorId || null,
      });
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (isEditMode) loadExisting();
  }, [isEditMode, loadExisting]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAllTutors()
      .then(setTutors)
      .catch((error) => setTutorsError(error.message));
  }, [isAdmin]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
    // the two times are validated against each other, so fixing one
    // should clear the complaint shown on the other
    if (field === 'startTime') clearFieldError('endTime');
    if (field === 'endTime') clearFieldError('startTime');
  }

  const duration = useMemo(() => computeDuration(form.startTime, form.endTime), [form.startTime, form.endTime]);

  async function handleSubmit(event) {
    event.preventDefault();
    setWarnings([]);
    setSuccessMessage('');

    if (!validate(validateClassForm(form, { requireTutor: isAdmin && !isEditMode }))) {
      return;
    }

    setIsSaving(true);

    const payload = {
      subject: form.subject,
      subjectArea: form.subjectArea,
      description: form.description,
      level: form.level,
      venue: form.venue,
      dayOfWeek: form.dayOfWeek,
      startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime,
      endTime: form.endTime.length === 5 ? `${form.endTime}:00` : form.endTime,
      capacity: Number(form.capacity),
      fee: Number(form.fee),
      tutorId: form.tutorId || undefined,
    };

    try {
      const result = isEditMode ? await updateClass(classId, payload) : await createClass(payload);
      setWarnings(result.warnings || []);
      setSuccessMessage(isEditMode ? 'Class updated successfully.' : 'Class published successfully.');
      setTimeout(() => navigate('/courses/manage'), 1200);
    } catch (error) {
      captureError(error);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <PortalShell navItems={NAV_ITEMS}>
        <div className="page">
          <LoadingSpinner label="Loading class..." />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>{isEditMode ? 'Edit Class' : 'Create New Class'}</h1>
          <p className="muted">Set up a tuition session and define its schedule, fees, and capacity.</p>
        </div>

        <Alert type="error" message={loadError} />
        {warnings.map((warning) => (
          <Alert key={warning} type="warning" message={warning} />
        ))}
        <Alert type="success" message={successMessage} />
        <Alert type="error" message={formError} />

        <div className="card">
          <form onSubmit={handleSubmit} noValidate>
            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="subject">Subject Name</label>
                <input
                  id="subject"
                  type="text"
                  placeholder="e.g. Advanced Mathematics - Form 4"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.subject)}
                  className={fieldErrors.subject ? 'input-error' : ''}
                />
                {fieldErrors.subject && <p className="field-error">{fieldErrors.subject}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="level">Grade / Level</label>
                <select
                  id="level"
                  value={form.level}
                  onChange={(e) => updateField('level', e.target.value)}
                  required
                >
                  {GRADES.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isAdmin && !isEditMode && (
              <div className="form-field">
                <label htmlFor="tutorSearch">Assign Tutor</label>
                <Alert type="error" message={tutorsError} />
                <TutorPicker
                  tutors={tutors}
                  value={form.tutorId}
                  onChange={(tutorId) => updateField('tutorId', tutorId)}
                  emptyMessage="No active tutors found. A tutor must register first."
                />
                {fieldErrors.tutorId && <p className="field-error">{fieldErrors.tutorId}</p>}
                {form.tutorId ? (
                  <p className="field-help">
                    Selected: {tutors.find((t) => t.id === form.tutorId)?.fullName}
                  </p>
                ) : (
                  <p className="field-help">Search or scroll to pick which Tutor teaches this class.</p>
                )}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="subjectArea">Subject Area</label>
              <select
                id="subjectArea"
                value={form.subjectArea}
                onChange={(e) => updateField('subjectArea', e.target.value)}
                required
              >
                {SUBJECT_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                placeholder="Comprehensive coverage of geometry, calculus fundamentals, and algebra."
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                className={fieldErrors.description ? 'input-error' : ''}
              />
              {fieldErrors.description && <p className="field-error">{fieldErrors.description}</p>}
            </div>

            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="venue">Venue / Classroom</label>
                <input
                  id="venue"
                  type="text"
                  placeholder="e.g. Classroom A"
                  value={form.venue}
                  onChange={(e) => updateField('venue', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.venue)}
                  className={fieldErrors.venue ? 'input-error' : ''}
                />
                {fieldErrors.venue && <p className="field-error">{fieldErrors.venue}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="dayOfWeek">Day of Week</label>
                <select id="dayOfWeek" value={form.dayOfWeek} onChange={(e) => updateField('dayOfWeek', e.target.value)}>
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="startTime">Start Time</label>
                <input
                  id="startTime"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateField('startTime', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.startTime)}
                  className={fieldErrors.startTime ? 'input-error' : ''}
                />
                {fieldErrors.startTime && <p className="field-error">{fieldErrors.startTime}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="endTime">End Time</label>
                <input
                  id="endTime"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField('endTime', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.endTime)}
                  className={fieldErrors.endTime ? 'input-error' : ''}
                />
                {fieldErrors.endTime && <p className="field-error">{fieldErrors.endTime}</p>}
              </div>
            </div>
            {!fieldErrors.startTime && !fieldErrors.endTime && (
              <p className="field-help" style={{ marginTop: '-10px' }}>Duration: {duration}</p>
            )}

            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="capacity">Maximum Capacity (Seats)</label>
                <input
                  id="capacity"
                  type="number"
                  min="1"
                  max="500"
                  value={form.capacity}
                  onChange={(e) => updateField('capacity', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.capacity)}
                  className={fieldErrors.capacity ? 'input-error' : ''}
                />
                {fieldErrors.capacity && <p className="field-error">{fieldErrors.capacity}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="fee">Monthly Fee (LKR)</label>
                <input
                  id="fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fee}
                  onChange={(e) => updateField('fee', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.fee)}
                  className={fieldErrors.fee ? 'input-error' : ''}
                />
                {fieldErrors.fee && <p className="field-error">{fieldErrors.fee}</p>}
              </div>
            </div>

            <div className="flex-between" style={{ marginTop: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses/manage')}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Publish Class'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PortalShell>
  );
}

export default CreateEditClassPage;
