// Small dependency-free icon set (stroke-style, 24x24 viewBox) shared by
// both modules so neither has to pull in an icon library just to match
// the mockups' sidebar / topbar / stat-card glyphs.
const PATHS = {
  home: 'M4 11.5 12 4l8 7.5M6 9.5V20h12V9.5',
  calendar:
    'M4 8h16M7 3v4M17 3v4M6 5.5h12A2 2 0 0 1 20 7.5v11A2 2 0 0 1 18 20.5H6A2 2 0 0 1 4 18.5v-11A2 2 0 0 1 6 5.5Z',
  card: 'M3.5 6.5h17A1 1 0 0 1 21.5 7.5v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM2.5 10.5h19M6 15h4',
  user: 'M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20.5c1.2-3.5 4-5.3 7-5.3s5.8 1.8 7 5.3',
  bell: 'M6 10.5a6 6 0 1 1 12 0c0 4 1.5 5 1.5 5h-15s1.5-1 1.5-5ZM9.7 18.5a2.3 2.3 0 0 0 4.6 0',
  mail: 'M4 6.5h16v11H4v-11Zm0 0 8 6.5 8-6.5',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff:
    'M3.5 3.5l17 17M10.6 10.7a3 3 0 0 0 4.2 4.2M7.4 7.6C5 9.1 3.5 12 3.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1.1M16.8 16.9C19.3 15.3 20.5 12 20.5 12s-1.4-2.6-3.9-4.4C15.2 6.6 13.6 5.5 12 5.5c-.7 0-1.4.1-2.1.4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3',
  menu: 'M3.5 6.5h17M3.5 12h17M3.5 17.5h17',
  x: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'm15 5-7 7 7 7',
  chevronDown: 'm6 9 6 6 6-6',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  checkCircle: 'M20.5 6.3 9.7 17 3.5 10.9 M21 12a9 9 0 1 1-4-7.5',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9l-6 6M9 9l6 6',
  receipt:
    'M6 3.5h12v17l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5v-17ZM8.5 8h7M8.5 11.5h7M8.5 15h4',
  shield: 'M12 3 4.5 6v6c0 5 3.4 8.4 7.5 9 4.1-.6 7.5-4 7.5-9V6L12 3Z',
  clock: 'M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  book: 'M5 4.5h9a2 2 0 0 1 2 2V19a2 2 0 0 0-2-2H5V4.5ZM19 4.5v14.5',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  spark: 'M12 3v4M12 17v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M3 12h4M17 12h4M4.2 19.8 7 17M17 7l2.8-2.8',
  plus: 'M12 5v14M5 12h14',
  wallet: 'M3 7.5h15a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1.5 1.5 0 0 1 1.5-1.5H17M16.5 13.2h.01',
  more: 'M12 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2ZM19 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2ZM5 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2Z',
};

function Icon({ name, size = 20, strokeWidth = 1.8, className = '' }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
