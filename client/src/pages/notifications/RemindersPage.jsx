// Tutor: schedule reminders for a date and time
import { useCallback, useEffect, useState } from 'react';
import {
  fetchMyClassesForMessaging,
  fetchMyReminders,
  scheduleReminder,
  cancelReminder,
} from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import MonthCalendar from '../../../../shared/client/src/components/common/MonthCalendar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { useYearOfHolidays } from '../../hooks/useHolidays';
import { formatLongDate, toDateKey, todayKey } from '../../../../shared/client/src/utils/schedule';

// the side menu for a tutor
const NAV_ITEMS = getNavItems('TUTOR');

// who a reminder can go to
const AUDIENCES = [
  { value: 'SELF', label: 'Only me' },
  { value: 'CLASS', label: 'One of my classes' },
  { value: 'ALL', label: 'All my students' },
];

// the next full hour, e.g. 14:20 -> today 15:00 (23:20 -> tomorrow 00:00)
function nextFullHour() {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return { date: toDateKey(next), time: `${String(next.getHours()).padStart(2, '0')}:00` };
}

// a send time as, for example, Mon, 12 Oct 2026, 3:30 PM
function formatSendAt(sendAt) {
  return new Date(sendAt.replace(' ', 'T')).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// who a reminder goes to, as text
function audienceText(reminder) {
  return reminder.isPersonal ? 'Only you' : `${reminder.recipientCount} student(s)`;
}

// reminders - a tutor schedules a reminder for a date and time, for themselves or their students
function RemindersPage() {
  // my classes, my reminders and the page state
  const [classes, setClasses] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // the new reminder form - date, time, who gets it, class, title and message
  const [date, setDate] = useState(() => nextFullHour().date);
  const [time, setTime] = useState(() => nextFullHour().time);
  const [audience, setAudience] = useState('SELF');
  const [classId, setClassId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [listError, setListError] = useState('');
  const holidays = useYearOfHolidays();

  // reload my reminders
  const loadReminders = useCallback(async () => {
    setReminders(await fetchMyReminders());
  }, []);

  // load my classes and reminders together (one failing does not blank the page)
  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([fetchMyClassesForMessaging(), fetchMyReminders()]).then(([classList, reminderList]) => {
      if (!isMounted) return;
      if (classList.status === 'fulfilled') setClasses(classList.value);
      if (reminderList.status === 'fulfilled') setReminders(reminderList.value);
      const failed = [classList, reminderList].find((result) => result.status === 'rejected');
      if (failed) setLoadError(failed.reason.message);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // reminders still to be sent, and the ones already sent
  const upcoming = reminders.filter((item) => item.status === 'SCHEDULED');
  const sent = reminders.filter((item) => item.status === 'SENT').reverse();

  // a time that has already passed today
  const timeIsPast = Boolean(date && time) && new Date(`${date}T${time}`) <= new Date();

  // schedule btn - check the form, then schedule the reminder
  async function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage('');

    const chosen = new Date(`${date}T${time || '00:00'}`);
    const isValid = validate({
      time: (!time && 'Pick a time.') || (chosen <= new Date() && 'Pick a time later than now.'),
      classId: audience === 'CLASS' && !classId && 'Choose the class to remind.',
      title:
        (title.trim().length < 3 && 'Give the reminder a short title (at least 3 characters).') ||
        (title.trim().length > 80 && 'Keep the title under 80 characters.'),
    });
    if (!isValid) return;

    setIsSaving(true);
    try {
      const response = await scheduleReminder({
        audience,
        classId: audience === 'CLASS' ? Number(classId) : undefined,
        title: title.trim(),
        message: message.trim(),
        remindAt: `${date}T${time}`,
      });
      setSuccessMessage(`${response.message} (${formatLongDate(date)} at ${time})`);
      setTitle('');
      setMessage('');
      await loadReminders();
    } catch (error) {
      captureError(error);
    } finally {
      setIsSaving(false);
    }
  }

  // cancel btn - cancel a scheduled reminder
  async function handleCancel(reminderId) {
    setListError('');
    try {
      await cancelReminder(reminderId);
      setConfirmCancelId(null);
      await loadReminders();
    } catch (error) {
      setListError(error.message);
    }
  }

  // the page - title, the new reminder form, upcoming and sent reminders
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Reminders</h1>
          <p className="muted">
            Pick a date and time. The reminder appears in the notification bell of the people you
            choose at exactly that time.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        {/* a spinner, or the page content */}
        {isLoading ? (
          <LoadingSpinner label="Loading reminders..." />
        ) : (
          <>
            {/* new reminder - pick the day on the calendar, then the time, who gets it and the text */}
            <div className="card">
              <h2>New reminder</h2>
              <Alert type="success" message={successMessage} />
              <Alert type="error" message={formError} />

              <form onSubmit={handleSubmit} noValidate>
                <div className="schedule-picker">
                  {/* calendar - a dot marks the days that already have a reminder */}
                  <MonthCalendar
                    selectedDate={date}
                    onSelectDate={(dateKey) => {
                      setDate(dateKey);
                      clearFieldError('time');
                    }}
                    minDate={todayKey()}
                    isMarked={(dateKey) => upcoming.some((item) => item.sendAt.startsWith(dateKey))}
                    markLegend="Has a reminder"
                    holidays={holidays}
                  />

                  <div>
                    {/* date and time */}
                    <div className="card-field-row">
                      <div className="form-field">
                        <label htmlFor="reminder-date">Date</label>
                        <input id="reminder-date" type="text" value={formatLongDate(date)} readOnly />
                      </div>
                      <div className="form-field">
                        <label htmlFor="reminder-time">Time</label>
                        <input
                          id="reminder-time"
                          type="time"
                          value={time}
                          onChange={(e) => {
                            setTime(e.target.value);
                            clearFieldError('time');
                          }}
                          className={fieldErrors.time || fieldErrors.remindAt || timeIsPast ? 'input-error' : ''}
                        />
                        {(fieldErrors.time || fieldErrors.remindAt || timeIsPast) && (
                          <p className="field-error">
                            {fieldErrors.time || fieldErrors.remindAt || 'That time has already passed. Pick a later time.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* who gets it - only me, one class or all my students */}
                    <div className="form-field">
                      <label>Send to</label>
                      <div className="period-tabs" role="radiogroup" aria-label="Send to">
                        {AUDIENCES.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={audience === option.value}
                            className={`period-tab${audience === option.value ? ' active' : ''}`}
                            onClick={() => {
                              setAudience(option.value);
                              clearFieldError('classId');
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* class choice - only when sending to one class */}
                    {audience === 'CLASS' && (
                      <div className="form-field">
                        <label htmlFor="reminder-class">Class</label>
                        <select
                          id="reminder-class"
                          value={classId}
                          onChange={(e) => {
                            setClassId(e.target.value);
                            clearFieldError('classId');
                          }}
                          className={fieldErrors.classId ? 'input-error' : ''}
                        >
                          <option value="">Choose a class...</option>
                          {classes.map((classItem) => (
                            <option key={classItem.id} value={classItem.id}>
                              {classItem.subject}
                              {classItem.level ? ` - ${classItem.level}` : ''}
                            </option>
                          ))}
                        </select>
                        {fieldErrors.classId && <p className="field-error">{fieldErrors.classId}</p>}
                      </div>
                    )}

                    {/* title */}
                    <div className="form-field">
                      <label htmlFor="reminder-title">Title</label>
                      <input
                        id="reminder-title"
                        type="text"
                        placeholder="e.g. Unit test on Saturday"
                        maxLength={80}
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          clearFieldError('title');
                        }}
                        className={fieldErrors.title ? 'input-error' : ''}
                      />
                      {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
                    </div>

                    {/* message - up to 300 characters */}
                    <div className="form-field">
                      <label htmlFor="reminder-message">Message (optional)</label>
                      <textarea
                        id="reminder-message"
                        placeholder="e.g. Bring your calculator and past papers."
                        maxLength={300}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                      <p className="field-help">{message.length}/300</p>
                      {fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
                    </div>

                    {/* schedule btn */}
                    <button type="submit" className="btn btn-primary" disabled={isSaving}>
                      <Icon name="clock" size={16} /> {isSaving ? 'Saving...' : 'Schedule reminder'}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* upcoming reminders - each with a Cancel btn that asks Cancel it or Keep first */}
            <div className="card">
              <h2>Upcoming</h2>
              <Alert type="error" message={listError} />
              {upcoming.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No reminders scheduled.
                </p>
              ) : (
                upcoming.map((reminder) => (
                  <div key={reminder.id} className="order-line">
                    <div style={{ minWidth: 0 }}>
                      <div className="order-line-title">{reminder.message}</div>
                      <div className="order-line-sub">
                        {formatSendAt(reminder.sendAt)} &middot; {audienceText(reminder)}
                      </div>
                    </div>
                    {/* cancel btn - asks Cancel it or Keep first */}
                    {confirmCancelId === reminder.id ? (
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancel(reminder.id)}>
                          Cancel it
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmCancelId(null)}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmCancelId(reminder.id)}
                      >
                        <Icon name="trash" size={14} /> Cancel
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* reminders already sent in the last 2 weeks */}
            {sent.length > 0 && (
              <div className="card">
                <h2>Sent in the last 2 weeks</h2>
                {sent.map((reminder) => (
                  <div key={reminder.id} className="order-line">
                    <div style={{ minWidth: 0 }}>
                      <div className="order-line-title">{reminder.message}</div>
                      <div className="order-line-sub">
                        {formatSendAt(reminder.sendAt)} &middot; {audienceText(reminder)}
                      </div>
                    </div>
                    <span className="badge badge-success">Sent</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default RemindersPage;
