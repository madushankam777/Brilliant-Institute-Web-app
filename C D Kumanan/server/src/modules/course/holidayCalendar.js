// Sri Lankan public holidays from Google Calendar (cached 12 hours)
const config = require('../../../../../shared/server/src/config/env');

const CACHE_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const FEED_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(config.holidays.calendarId)}/public/basic.ics`;

let cache = { holidays: [], loadedAt: 0 };
let pending = null;

// iCal wraps long lines: a line starting with a space continues the one before
function unfoldLines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(value) {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

// '20260512' -> '2026-05-12'
function toDateKey(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

// Keeps public holidays only - the feed also lists observances like Mother's Day.
function parseHolidays(icsText) {
  const namesByDate = new Map();
  let event = null;

  unfoldLines(icsText).forEach((line) => {
    if (line === 'BEGIN:VEVENT') {
      event = {};
      return;
    }
    if (line === 'END:VEVENT') {
      const description = event && event.description ? event.description : '';
      if (event && event.start && event.summary && description.startsWith('Public holiday')) {
        const summary = event.summary.replace(/\s*\(tentative\)/i, '');
        const name = /tentative/i.test(description) ? `${summary} (date may change)` : summary;
        // DTEND is the day after the last day of the holiday
        const end = event.end || addDays(event.start, 1);
        for (let day = event.start; day < end; day = addDays(day, 1)) {
          namesByDate.set(day, [...(namesByDate.get(day) || []), name]);
        }
      }
      event = null;
      return;
    }
    if (!event) return;

    const separator = line.indexOf(':');
    const key = line.slice(0, separator).split(';')[0];
    const value = line.slice(separator + 1);
    if (key === 'DTSTART') event.start = toDateKey(value);
    if (key === 'DTEND') event.end = toDateKey(value);
    if (key === 'SUMMARY') event.summary = unescapeText(value);
    if (key === 'DESCRIPTION') event.description = unescapeText(value);
  });

  return [...namesByDate.entries()]
    .map(([date, names]) => ({ date, name: [...new Set(names)].join(' / ') }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFeed() {
  try {
    const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cache = { holidays: parseHolidays(await response.text()), loadedAt: Date.now() };
  } catch (error) {
    console.warn(`[holidays] Could not load Google Calendar holidays (${error.message}) - will try again later.`);
    // keep the last good copy and try again in 10 minutes
    cache = { ...cache, loadedAt: Date.now() - CACHE_MS + RETRY_MS };
  }
}

async function loadHolidays() {
  if (Date.now() - cache.loadedAt >= CACHE_MS) {
    // one download at a time, however many requests arrive together
    if (!pending) pending = fetchFeed().finally(() => { pending = null; });
    await pending;
  }
  return cache.holidays;
}

// [{ date: 'YYYY-MM-DD', name }] between two dates (inclusive)
async function getHolidays(fromDate, toDate) {
  const holidays = await loadHolidays();
  return holidays.filter((holiday) => holiday.date >= fromDate && holiday.date <= toDate);
}

module.exports = { getHolidays, parseHolidays };
