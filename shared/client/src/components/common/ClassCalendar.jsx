import Icon from './Icon';
import { formatTime, monthCells, occurrencesOn, parseDateKey, todayKey } from '../../utils/schedule';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayLabel(dateKey, holiday, classCount, hasCancelled, hasExtra) {
  const parts = [parseDateKey(dateKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })];
  if (holiday) parts.push(`public holiday: ${holiday}`);
  if (classCount > 0) parts.push(`${classCount} class${classCount === 1 ? '' : 'es'}`);
  if (hasCancelled) parts.push('a class is cancelled');
  if (hasExtra) parts.push('extra class');
  return parts.join(', ');
}

const CHIP_CLASS = {
  regular: 'class-calendar-chip',
  cancelled: 'class-calendar-chip is-cancelled',
  extra: 'class-calendar-chip is-extra',
};

// Full month view: classes as chips, public holidays in red with that day's
// classes crossed out. A day with a cancelled class gets an orange dot and a
// day with an extra class a green dot.
function ClassCalendar({ year, month, onMonthChange, classes, events = [], holidays = {}, selectedDate, onSelectDate }) {
  const today = todayKey();
  // blank cells finish the last week so the grid stays a full rectangle
  const cells = monthCells(year, month);
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(step) {
    const date = new Date(year, month + step, 1);
    onMonthChange(date.getFullYear(), date.getMonth());
  }

  function goToToday() {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth());
    onSelectDate(today);
  }

  return (
    <div className="class-calendar">
      <div className="class-calendar-header">
        <div className="class-calendar-title-row">
          <button type="button" className="month-calendar-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </button>
          <h2 className="class-calendar-title">
            {new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </h2>
          <button type="button" className="month-calendar-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={goToToday}>
          Today
        </button>
      </div>

      <div className="class-calendar-grid">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="class-calendar-weekday">
            {label}
          </span>
        ))}

        {cells.map((dateKey, index) => {
          if (!dateKey) return <span key={`blank-${index}`} className="class-calendar-blank" />;

          const dayClasses = occurrencesOn(classes, events, dateKey);
          const hasCancelled = dayClasses.some((item) => item.kind === 'cancelled');
          const hasExtra = dayClasses.some((item) => item.kind === 'extra');
          const holiday = holidays[dateKey];
          const classNames = [
            'class-calendar-day',
            dateKey === today ? 'is-today' : '',
            dateKey === selectedDate ? 'is-selected' : '',
            holiday ? 'is-holiday' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={dateKey}
              type="button"
              className={classNames}
              onClick={() => onSelectDate(dateKey)}
              aria-pressed={dateKey === selectedDate}
              aria-label={dayLabel(dateKey, holiday, dayClasses.length, hasCancelled, hasExtra)}
              title={holiday || undefined}
            >
              <span className="class-calendar-number">{Number(dateKey.slice(8))}</span>
              {holiday && <span className="class-calendar-holiday">{holiday}</span>}
              {dayClasses.slice(0, 2).map((item) => (
                <span key={item.key} className={CHIP_CLASS[item.kind]}>
                  {formatTime(item.startTime)} {item.subject}
                </span>
              ))}
              {dayClasses.length > 2 && <span className="class-calendar-more">+{dayClasses.length - 2} more</span>}
              {(hasCancelled || hasExtra) && (
                <span className="class-calendar-dots" aria-hidden="true">
                  {hasCancelled && <span className="class-calendar-dot is-cancelled" />}
                  {hasExtra && <span className="class-calendar-dot is-extra" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="class-calendar-legend">
        <span>
          <span className="class-calendar-dot is-cancelled" /> Class cancelled
        </span>
        <span>
          <span className="class-calendar-dot is-extra" /> Extra class
        </span>
        <span>
          <span className="class-calendar-holiday-swatch" /> Public holiday - no classes
        </span>
      </div>
    </div>
  );
}

export default ClassCalendar;
