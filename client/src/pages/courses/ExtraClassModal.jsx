// "Extra class" dialog
import { useEffect, useState } from 'react';
import { addExtraClass, browseClasses } from '../../api/courseApi';
import useClassEvents from '../../hooks/useClassEvents';
import { useYearOfHolidays } from '../../hooks/useHolidays';
import Alert from '../../../../shared/client/src/components/common/Alert';
import MonthCalendar from '../../../../shared/client/src/components/common/MonthCalendar';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';
import {
  addDaysToKey,
  formatLongDate,
  formatTime,
  formatTimeRange,
  fromMinutes,
  occurrencesOn,
  toMinutes,
  todayKey,
} from '../../../../shared/client/src/utils/schedule';

// time choices - 6:00 AM to 10:00 PM every 30 minutes
const TIME_SLOTS = [];
for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 30) {
  TIME_SLOTS.push(fromMinutes(minutes));
}

function withValue(options, value) {
  return options.includes(value) ? options : [...options, value].sort();
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function overlaps(item, startTime, endTime) {
  return toMinutes(item.startTime) < toMinutes(endTime) && toMinutes(item.endTime) > toMinutes(startTime);
}

function ExtraClassModal({ classItem, onClose, onSaved }) {
  const today = todayKey();
  const [allClasses, setAllClasses] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [events] = useClassEvents(today, addDaysToKey(today, 365));
  const holidays = useYearOfHolidays();

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState(classItem.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(classItem.endTime.slice(0, 5));
  const [venue, setVenue] = useState(classItem.venue);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  useEffect(() => {
    browseClasses()
      .then(setAllClasses)
      .catch((error) => setLoadError(error.message));
  }, []);

  const room = venue.trim();
  const venues = [...new Set(allClasses.map((item) => item.venue).filter(Boolean))].sort();
  // nothing runs on a public holiday
  const dayClasses = date ? occurrencesOn(allClasses, events, date) : [];
  const running = holidays[date] ? [] : dayClasses.filter((item) => item.kind !== 'cancelled');
  const hasTimes = startTime && endTime && toMinutes(endTime) > toMinutes(startTime);
  // today: a start time that has already passed can't be picked
  const isPast = (time) => date === today && toMinutes(time) <= nowMinutes();
  const startIsPast = Boolean(startTime) && isPast(startTime);
  const startOptions = withValue(TIME_SLOTS.slice(0, -1), startTime);
  const endOptions = withValue(TIME_SLOTS, endTime).filter((time) => toMinutes(time) > toMinutes(startTime));

  // new start keeps the same length of class
  function changeStart(value) {
    const length = Math.max(toMinutes(endTime) - toMinutes(startTime), 30);
    setStartTime(value);
    if (toMinutes(endTime) <= toMinutes(value)) {
      setEndTime(fromMinutes(Math.min(toMinutes(value) + length, 22 * 60)));
    }
    clearFieldError('startTime');
    clearFieldError('endTime');
  }

  // same hall, or the same tutor, at an overlapping time
  const clash =
    hasTimes &&
    running.find(
      (item) =>
        overlaps(item, startTime, endTime) &&
        (item.venue.toLowerCase() === room.toLowerCase() || item.tutorId === classItem.tutorId)
    );

  async function handleSubmit(event) {
    event.preventDefault();
    const ok = validate({
      date: !date && 'Pick a day on the calendar.',
      startTime: startIsPast && 'That time has already passed today. Pick a later time.',
      endTime: !hasTimes && 'End time must be after the start time.',
      venue: !room && 'Enter the hall or room.',
    });
    if (!ok || clash) return;

    setIsSaving(true);
    try {
      const result = await addExtraClass(classItem.id, { date, startTime, endTime, venue: room, note: note.trim() });
      onSaved(result.message);
    } catch (error) {
      captureError(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="extra-class-title">
      <div className="modal-dialog modal-wide">
        <ModalClose onClose={onClose} disabled={isSaving} />
        <h2 id="extra-class-title">Extra class - {classItem.subject}</h2>
        <p className="muted" style={{ marginTop: '-6px' }}>
          Pick a day to see every class booked that day, then choose a free time and hall. Enrolled students are told
          straight away.
        </p>

        <Alert type="error" message={loadError || formError} />

        <form onSubmit={handleSubmit} noValidate>
          <div className="schedule-picker">
            <div>
              <MonthCalendar
                selectedDate={date}
                onSelectDate={(dateKey) => {
                  setDate(dateKey);
                  clearFieldError('date');
                }}
                minDate={today}
                isMarked={(dateKey) =>
                  dateKey >= today &&
                  !holidays[dateKey] &&
                  occurrencesOn(allClasses, events, dateKey).some(
                    (item) => item.kind !== 'cancelled' && item.venue.toLowerCase() === room.toLowerCase()
                  )
                }
                markLegend={room ? `${room} in use` : undefined}
                holidays={holidays}
              />
              {fieldErrors.date && <p className="field-error">{fieldErrors.date}</p>}
            </div>

            <div className="day-agenda">
              {!date ? (
                <p className="muted" style={{ margin: 0 }}>
                  Pick a day to see its classes.
                </p>
              ) : (
                <>
                  <h3>{formatLongDate(date)}</h3>
                  {holidays[date] && (
                    <p className="field-error" style={{ margin: '0 0 8px' }}>
                      Public holiday - {holidays[date]}. Pick another day.
                    </p>
                  )}
                  {dayClasses.length === 0 ? (
                    !holidays[date] && <p className="day-agenda-free">No classes booked - every hall is free.</p>
                  ) : (
                    dayClasses.map((item) => (
                      <div
                        key={item.key}
                        className={`agenda-class${item.kind === 'cancelled' || holidays[date] ? ' is-cancelled' : ''}`}
                      >
                        <span className="day-agenda-time">{formatTimeRange(item.startTime, item.endTime)}</span>
                        <span className="agenda-class-body">
                          <strong>{item.subject}</strong>
                          <span className="order-line-sub">
                            {item.venue} · {item.tutorName}
                            {item.kind === 'cancelled' && ' · cancelled'}
                            {item.kind === 'extra' && ' · extra class'}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card-field-row">
            <div className="form-field">
              <label htmlFor="extra-start">Start time</label>
              <select
                id="extra-start"
                value={startTime}
                className={fieldErrors.startTime || startIsPast ? 'input-error' : ''}
                onChange={(e) => changeStart(e.target.value)}
              >
                {startOptions.map((time) => (
                  <option key={time} value={time} disabled={isPast(time)}>
                    {formatTime(time)}
                    {isPast(time) ? ' (passed)' : ''}
                  </option>
                ))}
              </select>
              {(fieldErrors.startTime || startIsPast) && (
                <p className="field-error">
                  {fieldErrors.startTime || 'That time has already passed today. Pick a later time.'}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="extra-end">End time</label>
              <select
                id="extra-end"
                value={endTime}
                className={fieldErrors.endTime ? 'input-error' : ''}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  clearFieldError('endTime');
                }}
              >
                {endOptions.map((time) => (
                  <option key={time} value={time}>
                    {formatTime(time)}
                  </option>
                ))}
              </select>
              {fieldErrors.endTime && <p className="field-error">{fieldErrors.endTime}</p>}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="extra-venue">Hall / venue</label>
            <input
              id="extra-venue"
              list="extra-venues"
              value={venue}
              maxLength={150}
              className={fieldErrors.venue ? 'input-error' : ''}
              onChange={(e) => {
                setVenue(e.target.value);
                clearFieldError('venue');
              }}
            />
            <datalist id="extra-venues">
              {venues.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {fieldErrors.venue && <p className="field-error">{fieldErrors.venue}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="extra-note">Note for students (optional)</label>
            <input
              id="extra-note"
              value={note}
              maxLength={255}
              placeholder="e.g. Revision before the term test"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {clash && (
            <p className="field-error" role="alert">
              {clash.venue.toLowerCase() === room.toLowerCase()
                ? `${clash.venue} is booked for "${clash.subject}" (${clash.tutorName}) at ${formatTimeRange(clash.startTime, clash.endTime)}.`
                : `${clash.tutorName} already teaches "${clash.subject}" at ${formatTimeRange(clash.startTime, clash.endTime)}.`}{' '}
              Choose another time or hall.
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Close
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || Boolean(clash) || startIsPast || Boolean(date && holidays[date])}
            >
              {isSaving ? 'Saving...' : 'Add extra class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExtraClassModal;
