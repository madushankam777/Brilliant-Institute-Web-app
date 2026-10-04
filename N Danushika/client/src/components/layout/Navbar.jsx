// top bar - logo, links and the user menu
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../../shared/client/src/components/common/Logo';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';

// the top bar - for a logged-in user, or for a visitor
function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // log out btn - end the session and go to the login page
  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // top bar for a logged-in user
  if (isLoggedIn) {
    // top bar for a visitor - Home, About, Classes, Contact, Log in and Register
    return (
      <header className="navbar">
        <div className="navbar-brand">
          <NavLink to="/">
            <Logo />
          </NavLink>
        </div>

        <div className="topbar-search">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search your account..." aria-label="Search" />
        </div>

        <div className="navbar-actions">
          <NavLink to="/profile" className="avatar-chip">
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={36} />
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

  // top bar for a visitor - Home, About, Classes, Contact, Log in and Register
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
        <a href="/#about" onClick={() => setMenuOpen(false)}>
          About
        </a>
        <a href="/#contact" onClick={() => setMenuOpen(false)}>
          Contact
        </a>
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
