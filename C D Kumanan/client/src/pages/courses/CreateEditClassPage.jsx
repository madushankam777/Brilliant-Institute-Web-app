// Tutor/Admin: create or edit a class, with CRS-05 conflict detection
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createClass, updateClass, fetchClassDetails, fetchAllTutors } from '../../api/courseApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import TutorPicker from '../../../../../shared/client/src/components/common/TutorPicker';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../../shared/client/src/constants/grades';
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
  const [saveError, setSaveError] = useState('');
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
  }

  const duration = useMemo(() => computeDuration(form.startTime, form.endTime), [form.startTime, form.endTime]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError('');
    setWarnings([]);
    setSuccessMessage('');

    if (isAdmin && !isEditMode && !form.tutorId) {
      setSaveError('Please select which Tutor this class belongs to.');
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
      setSaveError(error.message);
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
        <Alert type="error" message={saveError} />

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
                  required
                />
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
              />
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
                  required
                />
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
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="endTime">End Time</label>
                <input
                  id="endTime"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField('endTime', e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="field-help" style={{ marginTop: '-10px' }}>Duration: {duration}</p>

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
                  required
                />
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
                  required
                />
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
