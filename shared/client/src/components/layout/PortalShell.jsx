import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon';

/**
 * Chrome for every authenticated ("portal") page: a left icon+label
 * sidebar on tablet/laptop/desktop, and a fixed bottom tab bar on mobile -
 * matching the dashboard-style pages in the design mockups. The Navbar
 * component still renders the very top bar (search/bell/avatar); this
 * component only owns the navigation rail and the content gutter.
 *
 * navItems: [{ to, label, icon, end? }]
 */
function PortalShell({ navItems, children }) {
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
        {navItems.map((item) => (
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
      </nav>
    </div>
  );
}

export default PortalShell;
