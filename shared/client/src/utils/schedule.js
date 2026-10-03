// Date and time helpers for timetables and calendars

// the days of the week, Monday first
export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// day names in the order javascript counts them, Sunday first
const JS_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// a number as two digits, like 07
function pad2(value) {
  return String(value).padStart(2, '0');
}

// a date as 2026-10-03
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// 2026-10-03 back to a date
export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// today's date as 2026-10-03
export function todayKey() {
  return toDateKey(new Date());
}

// the weekday name of a date
export function dayNameOf(dateKey) {
  return JS_DAY_NAMES[parseDateKey(dateKey).getDay()];
}

// a date some days later (or earlier)
export function addDaysToKey(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// the Monday of the week that contains dateKey
export function startOfWeek(dateKey) {
  const date = parseDateKey(dateKey);
  return addDaysToKey(dateKey, -((date.getDay() + 6) % 7));
}

// { Monday: '2026-09-21', ..., Sunday: '2026-09-27' } for the week of dateKey
export function weekDates(dateKey) {
  const monday = startOfWeek(dateKey);
  const dates = {};
  WEEK_DAYS.forEach((day, index) => {
    dates[day] = addDaysToKey(monday, index);
  });
  return dates;
}

// a month as date keys, Monday first, with nulls before the 1st
export function monthCells(year, monthIndex) {
  const blanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array(blanks).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(new Date(year, monthIndex, day)));
  }
  return cells;
}

// 'Monday, 12 October 2026'
export function formatLongDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// '15:00' or '15:00:00' -> minutes after midnight
export function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

// minutes after midnight -> '15:00'
export function fromMinutes(totalMinutes) {
  return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
}

// '15:00:00' -> '3:00 PM'
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = String(time).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${pad2(minutes)} ${suffix}`;
}

// '3:30 - 5:30 PM', or '11:00 AM - 1:00 PM' when it crosses noon
export function formatTimeRange(startTime, endTime) {
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  const sameHalfOfDay = start.slice(-2) === end.slice(-2);
  return `${sameHalfOfDay ? start.slice(0, -3) : start} - ${end}`;
}

// A weekly class runs on a date when the weekday matches and it has started.
export function classRunsOn(classItem, dateKey) {
  if (classItem.dayOfWeek !== dayNameOf(dateKey)) return false;
  return !classItem.startDate || dateKey >= classItem.startDate;
}

// classes in time order
export function sortByStartTime(classes) {
  return [...classes].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

// the classes that run on a date, in time order
export function classesOn(classes, dateKey) {
  return sortByStartTime(classes.filter((item) => classRunsOn(item, dateKey)));
}

// One day's classes with that day's changes applied
export function occurrencesOn(classes, events, dateKey) {
  const classById = new Map(classes.map((item) => [item.id, item]));
  // this day's changes - cancelled and extra classes
  const dayEvents = events.filter((event) => event.date === dateKey && classById.has(event.classId));

  // the weekly classes of the day, marked cancelled when they are
  const weekly = classesOn(classes, dateKey).map((item) => {
    const cancelled = dayEvents.find((event) => event.type === 'CANCELLED' && event.classId === item.id);
    return { ...item, key: `class-${item.id}`, kind: cancelled ? 'cancelled' : 'regular', event: cancelled || null };
  });
  // extra classes added for the day
  const extras = dayEvents
    .filter((event) => event.type === 'EXTRA')
    .map((event) => ({
      ...classById.get(event.classId),
      startTime: event.startTime,
      endTime: event.endTime,
      venue: event.venue,
      key: `extra-${event.id}`,
      kind: 'extra',
      event,
    }));
  return sortByStartTime([...weekly, ...extras]);
}

// The next class that has not started yet, looking up to two weeks ahead
export function findNextClass(classes, now = new Date(), holidays = {}, events = []) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dateKey = toDateKey(date);
    if (holidays[dateKey]) continue;
    // the classes that day that have not started and are not cancelled
    const upcoming = occurrencesOn(classes, events, dateKey).filter(
      (item) => item.kind !== 'cancelled' && (offset > 0 || toMinutes(item.startTime) > nowMinutes)
    );
    if (upcoming.length > 0) {
      return { classItem: upcoming[0], dateKey, daysAway: offset, isToday: offset === 0, isTomorrow: offset === 1 };
    }
  }
  return null;
}

// 'Today, 3:00 PM' / 'Tomorrow, 3:00 PM' / 'Mon, 3:00 PM' / 'Sat 3 Oct, 9:00 AM'
export function describeNextClass(next) {
  const time = formatTime(next.classItem.startTime);
  if (next.isToday) return `Today, ${time}`;
  if (next.isTomorrow) return `Tomorrow, ${time}`;
  if (next.daysAway >= 7) {
    const date = parseDateKey(next.dateKey).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${date}, ${time}`;
  }
  return `${dayNameOf(next.dateKey).slice(0, 3)}, ${time}`;
}
