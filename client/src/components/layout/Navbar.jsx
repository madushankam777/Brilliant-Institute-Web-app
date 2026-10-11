// top bar - logo, search, notification bell, profile chip and log out (or the public menu)
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMyAnnouncements,
  fetchMyNotifications,
  fetchUsers,
  dismissMyNotification,
  dismissMyAnnouncement,
  clearMyNotifications,
} from '../../api/adminApi';
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

// a time as 5m ago, 2h ago, 3d ago
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

// icon + small badge for each kind of personal notification
const NOTIFICATION_STYLES = {
  REMINDER: { icon: 'clock', badge: 'Reminder', tone: 'badge-warning' },
  FEE_DUE: { icon: 'wallet', badge: 'Reminder', tone: 'badge-warning' },
  LOW_ATTENDANCE: { icon: 'alertTriangle', badge: 'Alert', tone: 'badge-danger' },
  CLASS_REMINDER: { icon: 'book', badge: null, tone: '' },
  PAYMENT_APPROVED: { icon: 'checkCircle', badge: null, tone: '' },
  PAYMENT_REJECTED: { icon: 'xCircle', badge: 'Action needed', tone: 'badge-danger' },
  PAYMENT_SUBMITTED: { icon: 'wallet', badge: 'To verify', tone: 'badge-warning' },
  PAYOUT_RECORDED: { icon: 'bank', badge: null, tone: '' },
  PAYMENT_DUE: { icon: 'wallet', badge: 'Pay now', tone: 'badge-danger' },
  ENROLMENT_AT_RISK: { icon: 'alertTriangle', badge: 'Urgent', tone: 'badge-danger' },
  ENROLMENT_RELEASED: { icon: 'xCircle', badge: null, tone: '' },
  SEAT_AVAILABLE: { icon: 'checkCircle', badge: 'Seats free', tone: 'badge-success' },
  PAYMENT_DECLINED: { icon: 'xCircle', badge: 'Try again', tone: 'badge-danger' },
  SLIP_RECEIVED: { icon: 'receipt', badge: null, tone: '' },
  PAYOUT_FAILED: { icon: 'bank', badge: 'Failed', tone: 'badge-danger' },
  CLASS_UPDATED: { icon: 'book', badge: null, tone: '' },
  CLASS_CANCELLED: { icon: 'calendar', badge: 'Cancelled', tone: 'badge-danger' },
  CLASS_ASSIGNED: { icon: 'book', badge: 'New', tone: 'badge-success' },
  STUDENT_ENROLLED: { icon: 'users', badge: null, tone: '' },
  STUDENT_LEFT: { icon: 'users', badge: null, tone: '' },
  ABSENCE_MARKED: { icon: 'alertTriangle', badge: null, tone: '' },
  FEEDBACK_NEW: { icon: 'chat', badge: 'New', tone: 'badge-warning' },
  FEEDBACK_REPLY: { icon: 'chat', badge: null, tone: '' },
  FEEDBACK_RESOLVED: { icon: 'checkCircle', badge: null, tone: '' },
  ENQUIRY_NEW: { icon: 'inbox', badge: 'New', tone: 'badge-warning' },
  WELCOME: { icon: 'spark', badge: null, tone: '' },
  ACCOUNT_STATUS: { icon: 'user', badge: null, tone: '' },
  PASSWORD_CHANGED: { icon: 'shield', badge: 'Security', tone: 'badge-warning' },
};

// icon for announcements
const ANNOUNCEMENT_STYLE = { icon: 'megaphone', badge: null, tone: '' };
// icon for any other notification
const DEFAULT_STYLE = { icon: 'bell', badge: null, tone: '' };

// pick the icon and badge for a bell item
function styleFor(item) {
  if (item.kind !== 'notification') return ANNOUNCEMENT_STYLE;
  return NOTIFICATION_STYLES[item.type] || DEFAULT_STYLE;
}

// check for new notifications every minute
const POLL_MS = 60 * 1000;
// a pop-up notice stays for 8 seconds
const TOAST_MS = 8000;

// the top bar - for a logged-in user, or for a visitor
function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [announcements, setAnnouncements] = useState([]);
  const [personalNotifications, setPersonalNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [dismissedVersions, setDismissedVersions] = useState({});
  const [toasts, setToasts] = useState([]);
  const notifRef = useRef(null);
  // ids already shown, so only notifications that arrive later pop up as a toast
  const knownIdsRef = useRef(null);

  const lastSeenKey = user ? `brilliant_notif_last_seen_${user.id}` : null;
  const dismissedKey = user ? `brilliant_notif_dismissed_${user.id}` : null;
  const userId = user ? user.id : null;

  // load bell notifications (announcements + personal notifications)
  const loadNotifications = useCallback(async () => {
    try {
      const [announcementData, personalData] = await Promise.all([
        fetchMyAnnouncements(),
        fetchMyNotifications(),
      ]);
      setAnnouncements(announcementData);
      setPersonalNotifications(personalData);

      if (knownIdsRef.current) {
        const fresh = personalData.filter((item) => !knownIdsRef.current.has(item.id)).slice(0, 3);
        if (fresh.length > 0) {
          setToasts((previous) => [...fresh, ...previous].slice(0, 3));
          fresh.forEach((item) => {
            setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== item.id)), TOAST_MS);
          });
        }
      }
      knownIdsRef.current = new Set(personalData.map((item) => item.id));
    } catch {
      // fail silently, not critical
    }
  }, []);

  // a different account starts with a clean slate
  useEffect(() => {
    knownIdsRef.current = null;
    setToasts([]);
  }, [userId]);

  // check again every minute
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const timer = setInterval(loadNotifications, POLL_MS);
    window.addEventListener('focus', loadNotifications);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', loadNotifications);
    };
  }, [isLoggedIn, loadNotifications]);

  // when the user logs in, restore what they last saw and dismissed, then load the bell
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

  // close the notification panel when you click outside it
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
      id: item.id,
      link: null,
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
      id: item.id,
      link: item.link || null,
      kind: 'notification',
      type: item.type,
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

  // bell btn - open or close the panel, and mark everything as seen
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

  // clear btn - hide one notification for good: saved on the server (every device) and in this browser
  function dismissNotification(item) {
    if (!dismissedKey) return;
    setDismissedVersions((prev) => {
      const next = { ...prev, [item.feedId]: item.version };
      writeVersionMap(dismissedKey, next);
      return next;
    });
    const saved =
      item.kind === 'notification' ? dismissMyNotification(item.id) : dismissMyAnnouncement(item.id, item.version);
    saved.catch(() => {
      // offline - this browser still remembers it, the server will hear next time
    });
  }

  // clear all btn - hide every notification, on every device
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
    clearMyNotifications().catch(() => {
      // offline - this browser still remembers it
    });
  }

  // click a notification - open the page it is about (that page highlights the item)
  function openNotification(item) {
    if (!item.link) return;
    setIsNotifOpen(false);
    setToasts([]);
    navigate(item.link);
  }

  // --- top bar search: classes for everyone, plus users for Admin ---
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState({ classes: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // close the search panel when you click outside it
  useEffect(() => {
    function handleClickOutsideSearch(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutsideSearch);
    return () => document.removeEventListener('mousedown', handleClickOutsideSearch);
  }, []);

  // search as you type - classes for everyone, people too for an admin
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

  // open a search result and clear the search box
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

  // log out btn - end the session and go to the login page
  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // top bar for a logged-in user
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
                              {[person.studentCode, person.email, person.role.replace('_', ' / ')].filter(Boolean).join(' · ')}
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
                    // a notification with a page opens it when clicked
                    <div
                      key={item.feedId}
                      className={`notification-item${item.link ? ' is-link' : ''}`}
                      role={item.link ? 'button' : undefined}
                      tabIndex={item.link ? 0 : undefined}
                      onClick={() => openNotification(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openNotification(item);
                        }
                      }}
                    >
                      <div className="notification-item-title">
                        <Icon name={styleFor(item).icon} size={14} />
                        <span style={{ flex: 1 }}>{item.title}</span>
                        {styleFor(item).badge && (
                          <span className={`badge ${styleFor(item).tone}`}>{styleFor(item).badge}</span>
                        )}
                        {item.isUpdated && <span className="badge">Updated</span>}
                        {item.priority === 'HIGH' && <span className="badge badge-danger">High</span>}
                        <button
                          type="button"
                          className="notification-item-dismiss"
                          aria-label="Clear this notification"
                          onClick={(event) => {
                            event.stopPropagation();
                            dismissNotification(item);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
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

          {toasts.length > 0 && (
            <div className="toast-stack" role="status" aria-live="polite">
              {toasts.map((toast) => (
                <div key={toast.id} className="toast">
                  <Icon name={toast.type === 'REMINDER' ? 'clock' : 'bell'} size={18} />
                  <button
                    type="button"
                    className="toast-main"
                    onClick={() => {
                      // a pop-up with a page opens it; otherwise the bell opens
                      if (toast.link) {
                        openNotification(toast);
                        return;
                      }
                      setToasts([]);
                      if (!isNotifOpen) toggleNotifications();
                    }}
                  >
                    <span className="toast-title">{toast.title}</span>
                    <span className="toast-body">{toast.message}</span>
                  </button>
                  <button
                    type="button"
                    className="toast-close"
                    aria-label="Close"
                    onClick={() => setToasts((previous) => previous.filter((item) => item.id !== toast.id))}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <NavLink to="/profile" className="avatar-chip">
            <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={36} />
            <span className="avatar-chip-text">
              <span className="avatar-chip-name">{user.fullName}</span>
              <span className="avatar-chip-role">{user.role.replace('_', ' / ')}</span>
            </span>
          </NavLink>
          <button
            type="button"
            className="btn btn-secondary btn-sm navbar-logout-btn"
            onClick={handleLogout}
            aria-label="Log out"
          >
            <Icon name="logout" size={15} /> <span className="btn-label">Log out</span>
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
