// create / edit class page
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createClass,
  updateClass,
  fetchClassDetails,
  fetchAllTutors,
  fetchMyTimetable,
  fetchUserTimetable,
} from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';
import MonthCalendar from '../../../../shared/client/src/components/common/MonthCalendar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { GRADES } from '../../../../shared/client/src/constants/grades';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { useYearOfHolidays } from '../../hooks/useHolidays';
import {
  dayNameOf,
  formatLongDate,
  formatTime,
  formatTimeRange,
  fromMinutes,
  parseDateKey,
  sortByStartTime,
  toDateKey,
  toMinutes,
  todayKey,
} from '../../../../shared/client/src/utils/schedule';
import { useAuth } from '../../context/AuthContext';
import NumberInput from '../../../../shared/client/src/components/common/NumberInput';

const SUBJECT_AREAS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English', 'Other'];

// classes can be booked in 15-minute steps between 6:00 AM and 10:00 PM
const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const SLOT_MINUTES = 15;
const TIME_SLOTS = [];
for (let minutes = DAY_START; minutes <= DAY_END; minutes += SLOT_MINUTES) {
  TIME_SLOTS.push(fromMinutes(minutes));
}

const emptyForm = {
  subject: '',
  subjectArea: 'Mathematics',
  description: '',
  level: GRADES[0],
  venue: '',
  startTime: '15:00',
  endTime: '16:30',
  capacity: 30,
  fee: '',
  tutorId: null,
};

// the next date (from today) that falls on the given weekday
function nextDateOn(dayOfWeek) {
  const today = parseDateKey(todayKey());
  for (let offset = 0; offset < 7; offset += 1) {
    const date = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
    if (dayNameOf(date) === dayOfWeek) return date;
  }
  return todayKey();
}

function overlaps(startTime, endTime, busy) {
  return toMinutes(startTime) < toMinutes(busy.endTime) && toMinutes(endTime) > toMinutes(busy.startTime);
}

// keeps an existing off-grid time (e.g. 15:10) selectable
function withValue(options, value) {
  return options.includes(value) ? options : [...options, value].sort();
}

function computeDuration(startTime, endTime) {
  const minutes = toMinutes(endTime) - toMinutes(startTime);
  if (minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours > 0 ? `${hours}h ` : ''}${rest > 0 ? `${rest}m` : ''}`.trim();
}

// Mirrors the server's own rules so mistakes are caught before the request.
function validateClassForm(form, { requireTutor, requireDate, selectedDate, holiday, clash }) {
  const capacity = Number(form.capacity);
  const fee = Number(form.fee);
  const subject = form.subject.trim();
  const venue = form.venue.trim();

  return {
    tutorId: requireTutor && !form.tutorId && 'Choose which tutor teaches this class.',
    date:
      (requireDate && !selectedDate && 'Pick the first class date on the calendar.') ||
      (requireDate && holiday && `That day is a public holiday (${holiday}). Pick another first class date.`),
    subject:
      (!subject && 'Enter a subject name.') ||
      (subject.length < 3 && 'Subject name must be at least 3 characters.') ||
      (subject.length > 150 && 'Subject name must be 150 characters or fewer.'),
    venue:
      (!venue && 'Enter the venue or classroom.') ||
      (venue.length > 150 && 'Venue must be 150 characters or fewer.'),
    description: form.description.length > 2000 && 'Description must be 2000 characters or fewer.',
    endTime:
      (toMinutes(form.endTime) <= toMinutes(form.startTime) && 'End time must be after the start time.') ||
      (clash && `This time overlaps "${clash.subject}" (${formatTimeRange(clash.startTime, clash.endTime)}).`),
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

function CreateEditClassPage() {
  const { classId } = useParams();
  const isEditMode = Boolean(classId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const isAdmin = user.role === 'ADMIN';

  const [form, setForm] = useState(emptyForm);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();
  const [successMessage, setSuccessMessage] = useState('');

  const [tutors, setTutors] = useState([]);
  const [tutorsError, setTutorsError] = useState('');
  const [tutorClasses, setTutorClasses] = useState([]);
  const holidays = useYearOfHolidays();

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
        startTime: (data.startTime || '15:00:00').slice(0, 5),
        endTime: (data.endTime || '16:30:00').slice(0, 5),
        capacity: data.capacity,
        fee: data.fee,
        tutorId: data.tutorId || null,
      });
      const startsLater = data.startDate && data.startDate >= todayKey();
      setSelectedDate(startsLater ? data.startDate : nextDateOn(data.dayOfWeek || 'Monday'));
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

  // the chosen tutor's other classes - these are the red dots and blocked times
  useEffect(() => {
    let isCurrent = true;
    const request = isAdmin
      ? form.tutorId
        ? fetchUserTimetable(form.tutorId)
        : null
      : fetchMyTimetable();

    if (!request) {
      setTutorClasses([]);
      return undefined;
    }
    request
      .then((data) => {
        if (isCurrent) setTutorClasses(data.classes.filter((item) => String(item.id) !== String(classId)));
      })
      .catch(() => {
        if (isCurrent) setTutorClasses([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [isAdmin, form.tutorId, classId]);

  const selectedDay = selectedDate ? dayNameOf(selectedDate) : null;
  const busySlots = useMemo(
    () => sortByStartTime(tutorClasses.filter((item) => item.dayOfWeek === selectedDay)),
    [tutorClasses, selectedDay]
  );
  const clash = busySlots.find((busy) => overlaps(form.startTime, form.endTime, busy)) || null;

  const now = new Date();
  const startsToday = !isEditMode && selectedDate === todayKey();
  const startOptions = withValue(TIME_SLOTS.slice(0, -1), form.startTime).map((time) => ({
    time,
    // a start time inside another class is taken, and today's passed times too
    taken:
      busySlots.some((busy) => toMinutes(time) >= toMinutes(busy.startTime) && toMinutes(time) < toMinutes(busy.endTime)) ||
      (startsToday && toMinutes(time) <= now.getHours() * 60 + now.getMinutes()),
  }));
  const endOptions = withValue(TIME_SLOTS, form.endTime)
    .filter((time) => toMinutes(time) > toMinutes(form.startTime))
    .map((time) => ({ time, taken: busySlots.some((busy) => overlaps(form.startTime, time, busy)) }));

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  }

  function handleStartChange(startTime) {
    setForm((previous) => {
      const endStillFits =
        toMinutes(previous.endTime) > toMinutes(startTime) &&
        !busySlots.some((busy) => overlaps(startTime, previous.endTime, busy));
      if (endStillFits) return { ...previous, startTime };

      // pick the first free end time, ideally an hour or more after the start
      const freeEnds = TIME_SLOTS.filter(
        (time) => toMinutes(time) > toMinutes(startTime) && !busySlots.some((busy) => overlaps(startTime, time, busy))
      );
      const endTime = freeEnds.find((time) => toMinutes(time) >= toMinutes(startTime) + 60) || freeEnds[0] || previous.endTime;
      return { ...previous, startTime, endTime };
    });
    clearFieldError('endTime');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage('');

    const checks = validateClassForm(form, {
      requireTutor: isAdmin && !isEditMode,
      requireDate: !isEditMode,
      selectedDate,
      holiday: selectedDate ? holidays[selectedDate] : null,
      clash,
    });
    if (!validate(checks)) return;

    setIsSaving(true);
    const payload = {
      subject: form.subject,
      subjectArea: form.subjectArea,
      description: form.description,
      level: form.level,
      venue: form.venue,
      dayOfWeek: selectedDay,
      startTime: `${form.startTime}:00`,
      endTime: `${form.endTime}:00`,
      capacity: Number(form.capacity),
      fee: Number(form.fee),
      tutorId: form.tutorId || undefined,
      // the first lesson date is only set when the class is created
      startDate: isEditMode ? undefined : selectedDate,
    };

    try {
      if (isEditMode) {
        await updateClass(classId, payload);
      } else {
        await createClass(payload);
      }
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

  const selectedTutor = tutors.find((tutor) => tutor.id === form.tutorId);
  const needsTutorFirst = isAdmin && !isEditMode && !form.tutorId;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>{isEditMode ? 'Edit Class' : 'Create New Class'}</h1>
          <p className="muted">
            {isEditMode
              ? 'Update the schedule, venue, fee or seats. Enrolled students are told about schedule changes.'
              : 'Choose the tutor, pick the first class day on the calendar, then set a free time.'}
          </p>
        </div>

        <Alert type="error" message={loadError} />
        <Alert type="success" message={successMessage} />
        <Alert type="error" message={formError} />

        <form onSubmit={handleSubmit} noValidate>
          <div className="card">
            <h2>Schedule</h2>

            {isAdmin && !isEditMode && (
              <div className="form-field">
                <label htmlFor="tutorSearch">Tutor</label>
                <Alert type="error" message={tutorsError} />
                <TutorPicker
                  tutors={tutors}
                  value={form.tutorId}
                  onChange={(tutorId) => updateField('tutorId', tutorId)}
                  emptyMessage="No active tutors found. A tutor must register first."
                />
                {fieldErrors.tutorId && <p className="field-error">{fieldErrors.tutorId}</p>}
                <p className="field-help">
                  {selectedTutor
                    ? `Selected: ${selectedTutor.fullName}. Days with a red dot are days they already teach.`
                    : 'Search or scroll to pick which tutor teaches this class.'}
                </p>
              </div>
            )}

            <div className="schedule-picker">
              <div>
                <MonthCalendar
                  selectedDate={selectedDate}
                  onSelectDate={(dateKey) => {
                    setSelectedDate(dateKey);
                    clearFieldError('date');
                    clearFieldError('endTime');
                  }}
                  minDate={todayKey()}
                  isMarked={(dateKey) => tutorClasses.some((item) => item.dayOfWeek === dayNameOf(dateKey))}
                  markLegend={needsTutorFirst ? undefined : 'Tutor already has a class'}
                  holidays={holidays}
                />
                {fieldErrors.date && <p className="field-error">{fieldErrors.date}</p>}
              </div>

              <div>
                <div className="day-agenda">
                  {!selectedDate ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {needsTutorFirst
                        ? 'Choose a tutor, then pick a day on the calendar.'
                        : 'Pick a day on the calendar to see what is already booked.'}
                    </p>
                  ) : (
                    <>
                      <h3>{formatLongDate(selectedDate)}</h3>
                      {holidays[selectedDate] && (
                        <p className="field-error" style={{ margin: '0 0 8px' }}>
                          Public holiday - {holidays[selectedDate]}. No classes are held on this date.
                        </p>
                      )}
                      {busySlots.length === 0 ? (
                        !holidays[selectedDate] && (
                          <p className="day-agenda-free">
                            {needsTutorFirst ? 'Choose a tutor to check their day.' : 'Free all day for this tutor.'}
                          </p>
                        )
                      ) : (
                        busySlots.map((busy) => (
                          <div key={busy.id} className="day-agenda-item">
                            <span className="day-agenda-time">{formatTimeRange(busy.startTime, busy.endTime)}</span>
                            <span>
                              {busy.subject}
                              {busy.venue ? ` · ${busy.venue}` : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>

                <div className="card-field-row" style={{ marginTop: '16px' }}>
                  <div className="form-field">
                    <label htmlFor="startTime">Start time</label>
                    <select id="startTime" value={form.startTime} onChange={(e) => handleStartChange(e.target.value)}>
                      {startOptions.map((option) => (
                        <option key={option.time} value={option.time} disabled={option.taken}>
                          {formatTime(option.time)}
                          {option.taken ? ' (not free)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="endTime">End time</label>
                    <select
                      id="endTime"
                      value={form.endTime}
                      onChange={(e) => updateField('endTime', e.target.value)}
                      className={fieldErrors.endTime || clash ? 'input-error' : ''}
                    >
                      {endOptions.map((option) => (
                        <option key={option.time} value={option.time} disabled={option.taken}>
                          {formatTime(option.time)}
                          {option.taken ? ' (booked)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {clash ? (
                  <p className="field-error" style={{ marginTop: '-10px' }}>
                    This time overlaps &quot;{clash.subject}&quot; ({formatTimeRange(clash.startTime, clash.endTime)}). Pick a
                    free time.
                  </p>
                ) : fieldErrors.endTime ? (
                  <p className="field-error" style={{ marginTop: '-10px' }}>{fieldErrors.endTime}</p>
                ) : (
                  <p className="field-help" style={{ marginTop: '-10px' }}>
                    Duration: {computeDuration(form.startTime, form.endTime)}
                    {selectedDay ? ` · Repeats every ${selectedDay}` : ''}
                  </p>
                )}
              </div>
            </div>

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
          </div>

          <div className="card">
            <h2>Class details</h2>
            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="subject">Subject Name</label>
                <input
                  id="subject"
                  type="text"
                  placeholder="e.g. Combined Mathematics - Grade 11"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.subject)}
                  className={fieldErrors.subject ? 'input-error' : ''}
                />
                {fieldErrors.subject && <p className="field-error">{fieldErrors.subject}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="level">Grade / Level</label>
                <select id="level" value={form.level} onChange={(e) => updateField('level', e.target.value)}>
                  {GRADES.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="subjectArea">Subject Area</label>
              <select
                id="subjectArea"
                value={form.subjectArea}
                onChange={(e) => updateField('subjectArea', e.target.value)}
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
                placeholder="What the class covers, e.g. algebra, geometry and past-paper practice."
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                className={fieldErrors.description ? 'input-error' : ''}
              />
              {fieldErrors.description && <p className="field-error">{fieldErrors.description}</p>}
            </div>

            <div className="card-field-row">
              <div className="form-field">
                <label htmlFor="capacity">Maximum Capacity (Seats)</label>
                <NumberInput
                  id="capacity"
                  maxLength={3}
                  value={form.capacity}
                  onChange={(value) => updateField('capacity', value)}
                  aria-invalid={Boolean(fieldErrors.capacity)}
                  className={fieldErrors.capacity ? 'input-error' : ''}
                />
                {fieldErrors.capacity && <p className="field-error">{fieldErrors.capacity}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="fee">Monthly Fee (LKR)</label>
                <NumberInput
                  id="fee"
                  decimals={2}
                  maxLength={10}
                  value={form.fee}
                  onChange={(value) => updateField('fee', value)}
                  aria-invalid={Boolean(fieldErrors.fee)}
                  className={fieldErrors.fee ? 'input-error' : ''}
                />
                {fieldErrors.fee && <p className="field-error">{fieldErrors.fee}</p>}
              </div>
            </div>
          </div>

          <div className="flex-between">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses/manage')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || Boolean(clash)}>
              {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Publish Class'}
            </button>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}

export default CreateEditClassPage;
