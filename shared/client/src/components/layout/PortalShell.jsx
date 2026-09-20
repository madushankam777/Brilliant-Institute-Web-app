import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from '../common/Icon';

// overflow nav items go behind a "More" tab on mobile
const MAX_VISIBLE_TABS = 4;

function PortalShell({ navItems, children }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const location = useLocation();

  const visibleItems = navItems.slice(0, MAX_VISIBLE_TABS);
  const overflowItems = navItems.slice(MAX_VISIBLE_TABS);
  const isOverflowActive = overflowItems.some((item) => location.pathname.startsWith(item.to));

  // close the "More" sheet on navigation or outside tap
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setIsMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="portal-shell">
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
          </NavLink>
        ))}
      </aside>

      <div className="portal-main">{children}</div>

      <nav className="portal-tabbar">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `portal-tabbar-link${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {overflowItems.length > 0 && (
          <div className="portal-tabbar-more" ref={moreRef}>
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
