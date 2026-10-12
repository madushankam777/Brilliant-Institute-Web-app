// portal shell - the side menu on a computer and a bottom tab bar on a phone, around every logged-in page
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import httpClient from '../../api/httpClient';
import { isInFinalGrade } from '../../utils/currentStudent';
import Icon from '../common/Icon';

// overflow nav items go behind a "More" tab on mobile
const MAX_VISIBLE_TABS = 4;
// check the badges every minute
const BADGE_POLL_MS = 60 * 1000;
// where each badge number comes from
const BADGE_SOURCES = { feedback: '/feedback/unread-count' };

// the small number on a menu item, e.g. unread chats
function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span className="nav-badge" aria-label={`${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

// portal shell - the page frame for logged-in users
function PortalShell({ navItems: allNavItems, children }) {
  // A/L students have nothing to re-register for
  const navItems = allNavItems.filter((item) => !(item.notForFinalGrade && isInFinalGrade()));
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const moreRef = useRef(null);
  const location = useLocation();
  // the badges this menu shows, e.g. "messages,feedback"
  const badgeKeys = navItems
    .map((item) => item.badge)
    .filter((key) => BADGE_SOURCES[key])
    .join(',');

  // unread chats and tickets - when the page opens, every minute, and after reading or sending
  useEffect(() => {
    if (!badgeKeys) return undefined;
    let isCurrent = true;
    async function loadBadges() {
      if (document.visibilityState === 'hidden') return;
      for (const key of badgeKeys.split(',')) {
        try {
          const response = await httpClient.get(BADGE_SOURCES[key], { background: true });
          if (isCurrent) setBadges((previous) => ({ ...previous, [key]: response.data.data.unread }));
        } catch {
          // not critical - the badge just stays as it was
        }
      }
    }
    loadBadges();
    const timer = setInterval(loadBadges, BADGE_POLL_MS);
    window.addEventListener('brilliant:feedback-changed', loadBadges);
    window.addEventListener('focus', loadBadges);
    return () => {
      isCurrent = false;
      clearInterval(timer);
      window.removeEventListener('brilliant:feedback-changed', loadBadges);
      window.removeEventListener('focus', loadBadges);
    };
  }, [badgeKeys]);

  const visibleItems = navItems.slice(0, MAX_VISIBLE_TABS);
  const overflowItems = navItems.slice(MAX_VISIBLE_TABS);
  // is the current page one of the items behind More
  const isOverflowActive = overflowItems.some((item) => location.pathname.startsWith(item.to));

  // close the "More" sheet on navigation or outside tap
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  // a tap outside the More sheet closes it
  useEffect(() => {
    function handleClickOutside(event) {
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setIsMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // the frame - side menu, the page, and the bottom tab bar (phones)
  return (
    <div className="portal-shell">
      {/* side menu (computers) */}
      <aside className="portal-sidebar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `portal-nav-link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            <NavBadge count={badges[item.badge]} />
          </NavLink>
        ))}
      </aside>

      {/* the page itself */}
      <div className="portal-main">{children}</div>

      {/* bottom tab bar (phones) - the first four items, the rest behind More */}
      <nav className="portal-tabbar">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `portal-tabbar-link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.shortLabel || item.label}</span>
            <NavBadge count={badges[item.badge]} />
          </NavLink>
        ))}

        {/* More tab - opens a sheet with the other items */}
        {overflowItems.length > 0 && (
          <div className="portal-tabbar-more" ref={moreRef}>
            {/* the sheet with the other items */}
            {isMoreOpen && (
              <div className="portal-tabbar-more-sheet">
                {overflowItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `portal-tabbar-more-item${isActive ? ' active' : ''}`}
                    onClick={() => setIsMoreOpen(false)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                    <NavBadge count={badges[item.badge]} />
                  </NavLink>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`portal-tabbar-link${isOverflowActive ? ' active' : ''}`}
              aria-expanded={isMoreOpen}
              aria-label="More menu"
              onClick={() => setIsMoreOpen((prev) => !prev)}
            >
              <Icon name="more" size={20} />
              <span>More</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}

export default PortalShell;
