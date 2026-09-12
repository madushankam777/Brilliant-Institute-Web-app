import { NavLink } from 'react-router-dom';
import Icon from '../common/Icon';

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
