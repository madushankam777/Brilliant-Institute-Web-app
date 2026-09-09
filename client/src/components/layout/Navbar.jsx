// Top bar for the combined site. Renders the public marketing navbar when
// signed out, and the authenticated "portal topbar" (search, notification
// bell, avatar chip linking to /profile, log out) once signed in - the
// same navbar for every role, since both modules share one login.
// Sidebar/bottom-tab navigation for signed-in pages is handled separately
// by <PortalShell>, per page.
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../shared/client/src/components/common/Logo';

function initialsOf(fullName) {
  return (fullName || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (isLoggedIn) {
    return (
      <header className="navbar">
        <div className="navbar-brand">
          <NavLink to="/">
            <Logo />
          </NavLink>
        </div>

        <div className="topbar-search">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search classes, billing, portal..." aria-label="Search" />
        </div>

        <div className="navbar-actions">
          <button type="button" className="topbar-icon-btn" aria-label="Notifications">
            <Icon name="bell" size={18} />
          </button>
          <NavLink to="/profile" className="avatar-chip">
            <span className="avatar-circle">{initialsOf(user.fullName) || <Icon name="user" size={16} />}</span>
            <span className="avatar-chip-text">
              <span className="avatar-chip-name">{user.fullName}</span>
              <span className="avatar-chip-role">{user.role.replace('_', ' / ')}</span>
            </span>
          </NavLink>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <Icon name="logout" size={15} /> Log out
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <NavLink to="/">
          <Logo />
        </NavLink>
      </div>

      <nav className={`navbar-links${menuOpen ? ' open' : ''}`}>
        <NavLink to="/" end onClick={() => setMenuOpen(false)}>
          Home
        </NavLink>
      </nav>

      <div className="navbar-actions">
        <NavLink to="/login" className="btn btn-secondary btn-sm">
          Log in
        </NavLink>
        <NavLink to="/register" className="btn btn-primary btn-sm">
          Register
        </NavLink>
        <button
          type="button"
          className="navbar-menu-toggle"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
        </button>
      </div>
    </header>
  );
}

export default Navbar;
