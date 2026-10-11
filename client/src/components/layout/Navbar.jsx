// top bar - the public menu for visitors; the logged-in bar (bell, search, profile) loads after login
import { lazy, Suspense, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../shared/client/src/components/common/Logo';

// the logged-in top bar - its own file, so visitors never download it
const MemberNavbar = lazy(() => import('./MemberNavbar'));

// the logo alone - shown while the logged-in bar loads
function NavbarPlaceholder() {
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <NavLink to="/">
          <Logo />
        </NavLink>
      </div>
    </header>
  );
}

// the top bar - for a logged-in user, or for a visitor
function Navbar() {
  const { isLoggedIn } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // top bar for a logged-in user
  if (isLoggedIn) {
    return (
      <Suspense fallback={<NavbarPlaceholder />}>
        <MemberNavbar />
      </Suspense>
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
        <NavLink to="/about" onClick={() => setMenuOpen(false)}>
          About
        </NavLink>
        <NavLink to="/courses/classes" onClick={() => setMenuOpen(false)}>
          Classes
        </NavLink>
        <NavLink to="/contact" onClick={() => setMenuOpen(false)}>
          Contact
        </NavLink>
        {/* mobile-only: Register (hidden on desktop) */}
        <NavLink to="/register" className="navbar-mobile-auth" onClick={() => setMenuOpen(false)}>
          Register
        </NavLink>
      </nav>

      <div className="navbar-actions">
        <NavLink to="/login" className="btn btn-secondary btn-sm">
          Log in
        </NavLink>
        <NavLink to="/register" className="btn btn-primary btn-sm navbar-topbar-auth">
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
