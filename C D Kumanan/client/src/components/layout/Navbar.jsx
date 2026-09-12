import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../../shared/client/src/components/common/Logo';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';

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
          <input type="search" placeholder="Search classes by keyword, tutor..." aria-label="Search" />
        </div>

        <div className="navbar-actions">
          <button
            type="button"
            className="topbar-icon-btn"
            aria-label="Notifications - available on the combined site"
            title="Notifications are available when this module runs as part of the combined site"
            disabled
          >
            <Icon name="bell" size={18} />
          </button>
          <span className="avatar-chip">
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={36} />
            <span className="avatar-chip-text">
              <span className="avatar-chip-name">{user.fullName}</span>
              <span className="avatar-chip-role">{user.role.replace('_', ' / ')}</span>
            </span>
          </span>
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
        <NavLink to="/login" className="btn btn-primary btn-sm">
          Log in
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
