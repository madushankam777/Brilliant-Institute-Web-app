// weekly timetable - Monday to Sunday columns with each day's classes, holidays, cancelled and extra classes
import {
  WEEK_DAYS,
  dayNameOf,
  formatLongDate,
  formatTimeRange,
  occurrencesOn,
  sortByStartTime,
  todayKey,
  weekDates,
} from '../../utils/schedule';

// css class for a class slot - cancelled or holiday, extra, or normal
function slotClass(item, holiday) {
  if (holiday || item.kind === 'cancelled') return 'timetable-slot is-cancelled';
  if (item.kind === 'extra') return 'timetable-slot is-extra';
  return 'timetable-slot';
}

// weekly classes for the day (flagged when cancelled that date) plus extra classes
function dayItems(classes, events, day, dateKey) {
  const weekly = sortByStartTime(classes.filter((item) => item.dayOfWeek === day));
  const changes = occurrencesOn(classes, events, dateKey);
  const cancelledIds = new Set(changes.filter((item) => item.kind === 'cancelled').map((item) => item.id));
  const extras = changes.filter((item) => item.kind === 'extra');
  return sortByStartTime([
    ...weekly.map((item) => ({ ...item, kind: cancelledIds.has(item.id) ? 'cancelled' : 'regular' })),
    ...extras,
  ]);
}

// one day of the week - its name, holiday and class slots
function DayColumn({ day, classes, isToday, holiday, showTutor, today }) {
  const classNames = [
    'timetable-day',
    isToday ? 'is-today' : '',
    holiday ? 'is-holiday' : '',
    classes.length === 0 ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames}>
      <div className="timetable-day-head">
        <div className="timetable-day-name">
          <span className="timetable-day-long">{day}</span>
          <span className="timetable-day-short">{day.slice(0, 3)}</span>
          {isToday && <span className="timetable-today">Today</span>}
        </div>
        {holiday && <span className="timetable-holiday">{holiday}</span>}
      </div>

      {/* the day's classes, or No classes */}
      <div className="timetable-day-slots">
        {classes.length === 0 ? (
          <p className="timetable-free">No classes</p>
        ) : (
          classes.map((item) => (
            <div key={item.key || item.id} className={slotClass(item, holiday)}>
              <span className="timetable-slot-time">{formatTimeRange(item.startTime, item.endTime)}</span>
              <span className="timetable-slot-subject">{item.subject}</span>
              <span className="timetable-slot-meta">
                {[item.venue, showTutor ? item.tutorName : item.level].filter(Boolean).join(' · ')}
              </span>
              {holiday && <span className="timetable-slot-note">No class - public holiday</span>}
              {!holiday && item.kind === 'cancelled' && <span className="timetable-slot-note">Cancelled this week</span>}
              {!holiday && item.kind === 'extra' && <span className="timetable-slot-extra">Extra class</span>}
              {!holiday && item.kind !== 'extra' && item.startDate && item.startDate > today && (
                <span className="timetable-slot-meta">Starts {formatLongDate(item.startDate)}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Monday-Sunday view of this week's classes
function WeeklyTimetable({ classes, holidays = {}, events = [], showTutor = false, emptyMessage = 'No classes scheduled yet.' }) {
  if (classes.length === 0) {
    return <p className="muted timetable-empty">{emptyMessage}</p>;
  }

  const today = todayKey();
  const todayName = dayNameOf(today);
  const datesThisWeek = weekDates(today);

  return (
    <div className="timetable-wrap">
      <div className="timetable">
        {WEEK_DAYS.map((day) => (
          <DayColumn
            key={day}
            day={day}
            classes={dayItems(classes, events, day, datesThisWeek[day])}
            isToday={day === todayName}
            holiday={holidays[datesThisWeek[day]]}
            showTutor={showTutor}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}

export default WeeklyTimetable;
