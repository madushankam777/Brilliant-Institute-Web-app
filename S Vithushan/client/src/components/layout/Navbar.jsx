import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchMyAnnouncements, fetchMyNotifications } from '../../api/adminApi';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../../shared/client/src/components/common/Logo';
import Avatar from '../../../../../shared/client/src/components/common/Avatar';

// Dismissals are stored as { [announcementId]: versionDismissedAt } rather
// than a plain id list - that's what lets an Admin's edit resurface a
// notice someone already cleared: the new version number no longer
// matches what they dismissed, so it counts as unseen again.
function readVersionMap(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeVersionMap(key, versionMap) {
  try {
    window.localStorage.setItem(key, JSON.stringify(versionMap));
  } catch {
    // localStorage can be unavailable (private browsing) - dismissals just
    // won't persist across reloads, which is a harmless degradation.
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

  // Two different sources feed the same bell: broadcast Announcements
  // (everyone in an audience/grade) and personal notifications from
  // notification_log (a fee-due/low-attendance reminder Admin sent to
  // this specific person) - without this second fetch, a reminder the
  // Admin "sends" would never actually show up anywhere for the student.
  const loadNotifications = useCallback(async () => {
    try {
      const [announcementData, personalData] = await Promise.all([
        fetchMyAnnouncements(),
        fetchMyNotifications(),
      ]);
      setAnnouncements(announcementData);
      setPersonalNotifications(personalData);
    } catch {
      // Notifications are a convenience, not critical - fail silently
      // rather than showing an alert over the whole page.
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

  // Announcements and personal reminders are two different tables with
  // their own id sequences - prefix each so they can share one dismissal
  // map and one sorted feed without ever colliding.
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

  // A dismissed notice only stays hidden while it's still the same version -
  // an Admin's later edit bumps the version, so it reappears as new.
  const visibleItems = feedItems.filter((item) => (dismissedVersions[item.feedId] ?? 0) < item.version);

  // The later of created/updated is what actually matters for "is this
  // new to me" - an edited notice should re-trigger the unread badge too.
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
          // localStorage can be unavailable (private browsing); the
          // unread badge just won't persist across reloads, which is fine.
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
          <input type="search" placeholder="Search admin metrics & platform activity..." aria-label="Search" />
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
