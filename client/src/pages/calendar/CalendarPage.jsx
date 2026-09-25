// Calendar for every role: the month's classes, public holidays (red, from
// Google Calendar), cancelled days (orange dot) and extra classes (green dot).
// Tutors and Admin can cancel a day or undo a change from the day panel.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelClassDay, deleteClassEvent, fetchMyTaughtClasses, fetchMyTimetable } from '../../api/courseApi';
import useHolidays from '../../hooks/useHolidays';
import useClassEvents from '../../hooks/useClassEvents';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import ClassCalendar from '../../../../shared/client/src/components/common/ClassCalendar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import {
  formatLongDate,
  formatTimeRange,
  occurrencesOn,
  parseDateKey,
  todayKey,
} from '../../../../shared/client/src/utils/schedule';

const INTRO = {
  STUDENT_PARENT: 'Your classes for the month. Classes are not held on public holidays.',
  TUTOR: 'The classes you teach this month. Classes are not held on public holidays.',
  ADMIN: 'Every class on the platform, month by month, with public holidays marked.',
};

function monthRange(year, month) {
  const mm = String(month + 1).padStart(2, '0');
  const lastDay = String(new Date(year, month + 1, 0).getDate()).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDay}` };
}

// opens Google Calendar with this class as a weekly event from dateKey
function googleCalendarLink(classItem, dateKey) {
  const day = dateKey.replace(/-/g, '');
  const time = (value) => value.slice(0, 5).replace(':', '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: classItem.subject,
    dates: `${day}T${time(classItem.startTime)}00/${day}T${time(classItem.endTime)}00`,
    ctz: 'Asia/Colombo',
    recur: 'RRULE:FREQ=WEEKLY',
    location: [classItem.venue, 'Brilliant Institute'].filter(Boolean).join(', '),
    details: classItem.tutorName ? `Tutor: ${classItem.tutorName}` : 'Brilliant Institute class',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function dayClassName(item, holiday) {
  if (holiday || item.kind === 'cancelled') return 'day-class is-cancelled';
  if (item.kind === 'extra') return 'day-class is-extra';
  return 'day-class';
}

function shortDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const isStaff = isAdmin || user.role === 'TUTOR';

  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [confirmKey, setConfirmKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [notice, setNotice] = useState('');

  const range = monthRange(view.year, view.month);
  const holidays = useHolidays(range.from, range.to);
  const [events, reloadEvents] = useClassEvents(range.from, range.to);

  useEffect(() => {
    let isCurrent = true;
    const request = isAdmin ? fetchMyTaughtClasses() : fetchMyTimetable().then((data) => data.classes);
    request
      .then((list) => {
        if (isCurrent) setClasses(list.filter((item) => item.status === 'ACTIVE'));
      })
      .catch((loadError) => {
        if (isCurrent) setError(loadError.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [isAdmin]);

  // moving to another month selects today (this month) or that month's 1st
  function selectDate(dateKey) {
    setSelectedDate(dateKey);
    setConfirmKey(null);
    setNotice('');
  }

  // cancel one day of a weekly class, or undo a change (restore / remove extra)
  async function runAction(item, action) {
    setBusyKey(item.key);
    setError('');
    try {
      const result =
        action === 'cancel'
          ? await cancelClassDay(item.id, { date: selectedDate })
          : await deleteClassEvent(item.event.id);
      setNotice(`${result.message} Enrolled students have been notified.`);
      setConfirmKey(null);
      reloadEvents();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyKey(null);
    }
  }

  function changeMonth(year, month) {
    setView({ year, month });
    const now = new Date();
    const isThisMonth = year === now.getFullYear() && month === now.getMonth();
    selectDate(isThisMonth ? todayKey() : monthRange(year, month).from);
  }

  const holiday = holidays[selectedDate];
  const dayClasses = occurrencesOn(classes, events, selectedDate);
  const canChange = isStaff && selectedDate >= todayKey();
  const monthHolidays = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b));

  return (
    <PortalShell navItems={getNavItems(user.role)}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Calendar</h1>
            <p className="muted">{INTRO[user.role]}</p>
          </div>
          {isStaff && (
            <Link to="/courses/manage" className="btn btn-secondary">
              <Icon name="plus" size={16} /> Add extra class
            </Link>
          )}
        </div>

        <Alert type="error" message={error} />
        <Alert type="success" message={notice} />

        {isLoading ? (
          <LoadingSpinner label="Loading calendar..." />
        ) : (
          <div className="calendar-layout">
            <div className="card">
              <ClassCalendar
                year={view.year}
                month={view.month}
                onMonthChange={changeMonth}
                classes={classes}
                events={events}
                holidays={holidays}
                selectedDate={selectedDate}
                onSelectDate={selectDate}
              />
            </div>

            <div>
              <div className="card">
                <h2>{formatLongDate(selectedDate)}</h2>

                {holiday && (
                  <div className="holiday-banner" role="status">
                    <Icon name="calendarDays" size={18} />
                    <div>
                      <strong>Public holiday - {holiday}</strong>
                      <p>
                        {dayClasses.length > 0
                          ? 'Classes are not available today because it is a public holiday.'
                          : 'The institute is closed for the holiday.'}
                      </p>
                    </div>
                  </div>
                )}

                {dayClasses.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No classes on this day.
                  </p>
                ) : (
                  dayClasses.map((item) => (
                    <div key={item.key} className={dayClassName(item, holiday)}>
                      <span className="day-class-time">{formatTimeRange(item.startTime, item.endTime)}</span>
                      <span className="order-line-title">{item.subject}</span>
                      <span className="order-line-sub">
                        {[item.venue, user.role === 'TUTOR' ? item.level : item.tutorName].filter(Boolean).join(' · ')}
                      </span>
                      {holiday && (
                        <span>
                          <span className="badge badge-danger">Not available - holiday</span>
                        </span>
                      )}
                      {!holiday && item.kind === 'cancelled' && (
                        <span>
                          <span className="badge badge-warning">Cancelled</span>
                          {item.event.note && <span className="order-line-sub"> {item.event.note}</span>}
                        </span>
                      )}
                      {!holiday && item.kind === 'extra' && (
                        <span>
                          <span className="badge badge-success">Extra class</span>
                          {item.event.note && <span className="order-line-sub"> {item.event.note}</span>}
                        </span>
                      )}
                      {isStaff && item.event && (
                        <span className="order-line-sub">
                          {item.kind === 'extra' ? 'Added' : 'Cancelled'} by {item.event.createdByName}
                        </span>
                      )}

                      {!holiday && canChange && (
                        <div className="day-class-actions">
                          {confirmKey === item.key ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busyKey === item.key}
                                onClick={() => runAction(item, item.kind === 'regular' ? 'cancel' : 'undo')}
                              >
                                {busyKey === item.key ? 'Saving...' : 'Confirm'}
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmKey(null)}>
                                Keep
                              </button>
                            </>
                          ) : item.kind === 'cancelled' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busyKey === item.key}
                              onClick={() => runAction(item, 'undo')}
                            >
                              {busyKey === item.key ? 'Restoring...' : 'Restore this day'}
                            </button>
                          ) : (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmKey(item.key)}>
                              {item.kind === 'extra' ? 'Remove extra class' : 'Cancel this day'}
                            </button>
                          )}
                        </div>
                      )}

                      {!holiday && !isAdmin && item.kind === 'regular' && (
                          <a
                            href={googleCalendarLink(item, selectedDate)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                          >
                            <Icon name="external" size={14} /> Add to Google Calendar
                          </a>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <h2>Holidays this month</h2>
                {monthHolidays.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No public holidays this month.
                  </p>
                ) : (
                  monthHolidays.map(([date, name]) => (
                    <button key={date} type="button" className="holiday-row" onClick={() => selectDate(date)}>
                      <span>{name}</span>
                      <span className="badge badge-danger">{shortDate(date)}</span>
                    </button>
                  ))
                )}
                <p className="field-help" style={{ marginBottom: 0 }}>Holidays from Google Calendar (Sri Lanka).</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default CalendarPage;
