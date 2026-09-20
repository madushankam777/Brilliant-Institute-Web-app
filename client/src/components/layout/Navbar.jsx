import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchMyAnnouncements, fetchMyNotifications, fetchUsers } from '../../api/adminApi';
import { browseClasses } from '../../api/courseApi';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../shared/client/src/components/common/Logo';
import Avatar from '../../../../shared/client/src/components/common/Avatar';

// read saved dismissed notifications
function readVersionMap(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// save dismissed notifications
function writeVersionMap(key, versionMap) {
  try {
    window.localStorage.setItem(key, JSON.stringify(versionMap));
  } catch {
    // ignore - storage may be unavailable
  }
}

function timeAgo(isoDate) {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [announcements, setAnnouncements] = useState([]);
  const [personalNotifications, setPersonalNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [dismissedVersions, setDismissedVersions] = useState({});
  const notifRef = useRef(null);

  const lastSeenKey = user ? `brilliant_notif_last_seen_${user.id}` : null;
  const dismissedKey = user ? `brilliant_notif_dismissed_${user.id}` : null;

  // load bell notifications (announcements + personal reminders)
  const loadNotifications = useCallback(async () => {
    try {
      const [announcementData, personalData] = await Promise.all([
        fetchMyAnnouncements(),
        fetchMyNotifications(),
      ]);
      setAnnouncements(announcementData);
      setPersonalNotifications(personalData);
    } catch {
      // fail silently, not critical
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (lastSeenKey) {
      try {
        setLastSeenAt(window.localStorage.getItem(lastSeenKey));
      } catch {
        setLastSeenAt(null);
      }
    }
    if (dismissedKey) {
      setDismissedVersions(readVersionMap(dismissedKey));
    }
    loadNotifications();
  }, [isLoggedIn, lastSeenKey, dismissedKey, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // combine announcements + personal reminders into one list
  const feedItems = [
    ...announcements.map((item) => ({
      feedId: `ann:${item.id}`,
      kind: 'announcement',
      title: item.title,
      body: item.body,
      isUpdated: item.isUpdated,
      priority: item.priority,
      version: item.version || 1,
      effectiveDate: item.updatedAt || item.createdAt,
    })),
    ...personalNotifications.map((item) => ({
      feedId: `notif:${item.id}`,
      kind: 'notification',
      title: item.title,
      body: item.message,
      isUpdated: false,
      priority: null,
      version: 1,
      effectiveDate: item.sentAt,
    })),
  ].sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

  // hide dismissed notifications
  const visibleItems = feedItems.filter((item) => (dismissedVersions[item.feedId] ?? 0) < item.version);

  // count unread for the bell badge
  const unreadCount = lastSeenAt
    ? visibleItems.filter((item) => new Date(item.effectiveDate) > new Date(lastSeenAt)).length
    : visibleItems.length;

  function toggleNotifications() {
    const opening = !isNotifOpen;
    setIsNotifOpen(opening);
    if (opening) {
      loadNotifications();
      if (lastSeenKey) {
        const now = new Date().toISOString();
        try {
          window.localStorage.setItem(lastSeenKey, now);
        } catch {
          // ignore - storage may be unavailable
        }
        setLastSeenAt(now);
      }
    }
  }

  function dismissNotification(item) {
    if (!dismissedKey) return;
    setDismissedVersions((prev) => {
      const next = { ...prev, [item.feedId]: item.version };
      writeVersionMap(dismissedKey, next);
      return next;
    });
  }

  function clearAllNotifications() {
    if (!dismissedKey) return;
    setDismissedVersions((prev) => {
      const next = { ...prev };
      visibleItems.forEach((item) => {
        next[item.feedId] = item.version;
      });
      writeVersionMap(dismissedKey, next);
      return next;
    });
  }

  // --- top bar search: classes for everyone, plus users for Admin ---
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState({ classes: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    function handleClickOutsideSearch(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutsideSearch);
    return () => document.removeEventListener('mousedown', handleClickOutsideSearch);
  }, []);

  useEffect(() => {
    const term = searchTerm.trim();
    if (!isLoggedIn || term.length < 2) {
      setSearchResults({ classes: [], users: [] });
      setIsSearching(false);
      return undefined;
    }

    let isCurrent = true;
    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const requests = [browseClasses({ search: term })];
        if (user.role === 'ADMIN') requests.push(fetchUsers({ search: term }));
        const [classes, users] = await Promise.all(requests);
        if (!isCurrent) return;
        setSearchResults({ classes: (classes || []).slice(0, 5), users: (users || []).slice(0, 5) });
      } catch {
        if (isCurrent) setSearchResults({ classes: [], users: [] });
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 250);

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
    };
  }, [searchTerm, isLoggedIn, user]);

  function goToSearchResult(path) {
    setIsSearchOpen(false);
    setSearchTerm('');
    navigate(path);
  }

  // Enter with no result picked: fall back to the full Browse Classes list
  function handleSearchSubmit(event) {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;
    goToSearchResult(`/courses/classes?search=${encodeURIComponent(term)}`);
  }

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

        <div className="topbar-search-wrap" ref={searchRef}>
          <form className="topbar-search" onSubmit={handleSearchSubmit} role="search">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search classes, tutors, people..."
              aria-label="Search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
            />
          </form>

          {isSearchOpen && searchTerm.trim().length >= 2 && (
            <div className="search-panel">
              {isSearching ? (
                <p className="search-empty">Searching...</p>
              ) : searchResults.classes.length === 0 && searchResults.users.length === 0 ? (
                <p className="search-empty">No matches for &ldquo;{searchTerm.trim()}&rdquo;.</p>
              ) : (
                <>
                  {searchResults.classes.length > 0 && (
                    <div className="search-group">
                      <p className="search-group-title">Classes</p>
                      {searchResults.classes.map((classItem) => (
                        <button
                          key={classItem.id}
                          type="button"
                          className="search-item"
                          onClick={() => goToSearchResult(`/courses/classes/${classItem.id}`)}
                        >
                          <Icon name="book" size={15} />
                          <span>
                            <span className="search-item-title">{classItem.subject}</span>
                            <span className="search-item-sub">
                              {classItem.tutorName}
                              {classItem.level ? ` · ${classItem.level}` : ''}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.users.length > 0 && (
                    <div className="search-group">
                      <p className="search-group-title">People</p>
                      {searchResults.users.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className="search-item"
                          onClick={() => goToSearchResult(`/admin/users/${person.id}`)}
                        >
                          <Icon name="user" size={15} />
                          <span>
                            <span className="search-item-title">{person.fullName}</span>
                            <span className="search-item-sub">
                              {person.email} · {person.role.replace('_', ' / ')}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="navbar-actions">
          <div className="notification-wrap" ref={notifRef}>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Notifications"
              aria-expanded={isNotifOpen}
              onClick={toggleNotifications}
            >
              <Icon name="bell" size={18} />
              {unreadCount > 0 && <span className="dot" />}
            </button>
            {isNotifOpen && (
              <div className="notification-panel">
                <div className="notification-panel-header flex-between">
                  <span>Notifications</span>
                  {visibleItems.length > 0 && (
                    <button type="button" className="notification-clear-all" onClick={clearAllNotifications}>
                      Clear all
                    </button>
                  )}
                </div>
                {visibleItems.length === 0 ? (
                  <p className="notification-empty">You&apos;re all caught up - nothing new yet.</p>
                ) : (
                  visibleItems.map((item) => (
                    <div key={item.feedId} className="notification-item">
                      <div className="notification-item-title">
                        <Icon name={item.kind === 'notification' ? 'alertTriangle' : 'bell'} size={14} />
                        <span style={{ flex: 1 }}>{item.title}</span>
                        {item.kind === 'notification' && <span className="badge badge-warning">Reminder</span>}
                        {item.isUpdated && <span className="badge">Updated</span>}
                        {item.priority === 'HIGH' && <span className="badge badge-danger">High</span>}
                        <button
                          type="button"
                          className="notification-item-dismiss"
                          aria-label="Clear this notification"
                          onClick={() => dismissNotification(item)}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                      <p className="notification-item-body">{item.body}</p>
                      <span className="notification-item-time">
                        {item.isUpdated ? 'Updated ' : ''}
                        {timeAgo(item.effectiveDate)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <NavLink to="/profile" className="avatar-chip">
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={36} />
            <span className="avatar-chip-text">
              <span className="avatar-chip-name">{user.fullName}</span>
              <span className="avatar-chip-role">{user.role.replace('_', ' / ')}</span>
            </span>
          </NavLink>
          <button type="button" className="btn btn-secondary btn-sm navbar-logout-btn" onClick={handleLogout}>
            <Icon name="logout" size={15} /> <span className="btn-label">Log out</span>
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
        <a href="/#about" onClick={() => setMenuOpen(false)}>
          About
        </a>
        <NavLink to="/courses/classes" onClick={() => setMenuOpen(false)}>
          Classes
        </NavLink>
        <a href="/#contact" onClick={() => setMenuOpen(false)}>
          Contact
        </a>
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
