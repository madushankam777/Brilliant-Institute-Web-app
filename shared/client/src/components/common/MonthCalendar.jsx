// the small month calendar used to pick a date (class days, reminders, extra classes)
import { useState } from 'react';
import Icon from './Icon';
import { monthCells, parseDateKey, toDateKey, todayKey } from '../../utils/schedule';

// the weekday headings, Monday first
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// the 1st of a date's month
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// month grid - dots for marked days, holidays in red
function MonthCalendar({ selectedDate, onSelectDate, isMarked, minDate, markLegend, holidays = {} }) {
  // the month being shown
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(selectedDate ? parseDateKey(selectedDate) : new Date())
  );
  const today = todayKey();

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const cells = monthCells(year, month);
  // is there a holiday in the month shown
  const hasHolidays = cells.some((dateKey) => dateKey && holidays[dateKey]);

  // no going back to months that are entirely before minDate
  const lastDayOfPreviousMonth = toDateKey(new Date(year, month, 0));
  const canGoBack = !minDate || lastDayOfPreviousMonth >= minDate;

  // the calendar - month name with arrows, the days, and a legend
  return (
    <div className="month-calendar">
      {/* month name with the previous and next btns */}
      <div className="month-calendar-header">
        <button
          type="button"
          className="month-calendar-nav"
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="month-calendar-title">
          {viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          className="month-calendar-nav"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      {/* the days - a day before minDate cannot be picked */}
      <div className="month-calendar-grid">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="month-calendar-weekday">
            {label}
          </span>
        ))}

        {cells.map((dateKey, index) => {
          if (!dateKey) return <span key={`blank-${index}`} />;

          const marked = Boolean(isMarked && isMarked(dateKey));
          const holiday = holidays[dateKey];
          const classNames = [
            'month-calendar-day',
            dateKey === selectedDate ? 'selected' : '',
            dateKey === today ? 'today' : '',
            holiday ? 'holiday' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const label = [
            parseDateKey(dateKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
            holiday ? `public holiday: ${holiday}` : '',
            marked && markLegend ? markLegend.toLowerCase() : '',
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={dateKey}
              type="button"
              className={classNames}
              disabled={Boolean(minDate && dateKey < minDate)}
              onClick={() => onSelectDate(dateKey)}
              aria-pressed={dateKey === selectedDate}
              aria-label={label}
              title={holiday || undefined}
            >
              {Number(dateKey.slice(8))}
              {marked && <span className="month-calendar-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* legend - what the dot and the red days mean */}
      {(markLegend || hasHolidays) && (
        <div className="month-calendar-legend">
          {markLegend && (
            <span>
              <span className="month-calendar-dot" aria-hidden="true" /> {markLegend}
            </span>
          )}
          {hasHolidays && (
            <span>
              <span className="class-calendar-holiday-swatch" aria-hidden="true" /> Public holiday
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MonthCalendar;
