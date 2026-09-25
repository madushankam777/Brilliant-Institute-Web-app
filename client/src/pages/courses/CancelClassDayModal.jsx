// "Cancel a date" dialog: calls off one day of a weekly class (the class
// carries on as usual the other weeks). Cancelled days can be put back.
import { useState } from 'react';
import { cancelClassDay, deleteClassEvent } from '../../api/courseApi';
import useClassEvents from '../../hooks/useClassEvents';
import { useYearOfHolidays } from '../../hooks/useHolidays';
import Alert from '../../../../shared/client/src/components/common/Alert';
import MonthCalendar from '../../../../shared/client/src/components/common/MonthCalendar';
import {
  addDaysToKey,
  classRunsOn,
  formatLongDate,
  formatTimeRange,
  todayKey,
} from '../../../../shared/client/src/utils/schedule';

function CancelClassDayModal({ classItem, onClose, onSaved }) {
  const today = todayKey();
  const [allEvents, reloadEvents] = useClassEvents(today, addDaysToKey(today, 365));
  const holidays = useYearOfHolidays();

  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const cancelled = allEvents.filter((event) => event.classId === classItem.id && event.type === 'CANCELLED');
  const isCancelled = (dateKey) => cancelled.some((event) => event.date === dateKey);
  const isClassDay = (dateKey) => dateKey >= today && classRunsOn(classItem, dateKey) && !holidays[dateKey];

  let dateProblem = '';
  if (date && holidays[date]) dateProblem = `Public holiday - ${holidays[date]}. There is no class that day anyway.`;
  else if (date && !classRunsOn(classItem, date)) dateProblem = `This class runs on ${classItem.dayOfWeek}s. Pick a ${classItem.dayOfWeek}.`;
  else if (date && isCancelled(date)) dateProblem = 'Already cancelled on this day.';

  async function handleCancel(event) {
    event.preventDefault();
    if (!date) {
      setError('Pick the day to cancel on the calendar.');
      return;
    }
    if (dateProblem) return;
    setBusyId('new');
    setError('');
    try {
      const result = await cancelClassDay(classItem.id, { date, note: note.trim() });
      onSaved(result.message);
    } catch (saveError) {
      setError(saveError.message);
      setBusyId(null);
    }
  }

  async function handleRestore(eventId) {
    setBusyId(eventId);
    setError('');
    try {
      await deleteClassEvent(eventId);
      reloadEvents();
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-day-title">
      <div className="modal-dialog modal-wide">
        <h2 id="cancel-day-title">Cancel a date - {classItem.subject}</h2>
        <p className="muted" style={{ marginTop: '-6px' }}>
          {classItem.dayOfWeek}s, {formatTimeRange(classItem.startTime, classItem.endTime)} at {classItem.venue}. Only the
          day you pick is cancelled; enrolled students are told straight away.
        </p>

        <Alert type="error" message={error} />

        <form onSubmit={handleCancel} noValidate>
          <div className="schedule-picker">
            <MonthCalendar
              selectedDate={date}
              onSelectDate={(dateKey) => {
                setDate(dateKey);
                setError('');
              }}
              minDate={today}
              isMarked={(dateKey) => isClassDay(dateKey) && !isCancelled(dateKey)}
              markLegend="Class day"
              holidays={holidays}
            />

            <div>
              <div className="day-agenda">
                {date ? (
                  <>
                    <h3>{formatLongDate(date)}</h3>
                    {dateProblem ? (
                      <p className="field-error" style={{ margin: 0 }}>
                        {dateProblem}
                      </p>
                    ) : (
                      <p style={{ margin: 0 }}>
                        &quot;{classItem.subject}&quot; will not be held on this day.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Pick a class day (marked with a dot) on the calendar.
                  </p>
                )}
              </div>

              <div className="form-field" style={{ marginTop: '16px' }}>
                <label htmlFor="cancel-note">Reason for students (optional)</label>
                <input
                  id="cancel-note"
                  value={note}
                  maxLength={255}
                  placeholder="e.g. Tutor is unwell"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {cancelled.length > 0 && (
                <div className="cancelled-days">
                  <h3>Already cancelled</h3>
                  {cancelled.map((event) => (
                    <div key={event.id} className="cancelled-day-row">
                      <span>
                        {formatLongDate(event.date)}
                        {event.note && <span className="order-line-sub">{event.note}</span>}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId !== null}
                        onClick={() => handleRestore(event.id)}
                      >
                        {busyId === event.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busyId === 'new'}>
              Close
            </button>
            <button type="submit" className="btn btn-danger" disabled={busyId !== null || Boolean(dateProblem)}>
              {busyId === 'new' ? 'Cancelling...' : 'Cancel this date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CancelClassDayModal;
