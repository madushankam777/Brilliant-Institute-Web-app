// logged-in top bar - logo, search, notification bell, profile chip and log out (loaded after login)
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMyAnnouncements,
  fetchMyNotifications,
  fetchUsers,
  dismissMyNotification,
  dismissMyAnnouncement,
  clearMyNotifications,
  markMyNotificationRead,
  markMyAnnouncementRead,
  markAllMyNotificationsRead,
  clearMyReadNotifications,
} from '../../api/adminApi';
import { browseClasses } from '../../api/courseApi';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Logo from '../../../../shared/client/src/components/common/Logo';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';


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
  ANNOUNCEMENT: { icon: 'chat', badge: null, tone: '' },
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

// the top bar for a logged-in user
function MemberNavbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [announcements, setAnnouncements] = useState([]);
  const [personalNotifications, setPersonalNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [dismissedVersions, setDismissedVersions] = useState({});
  // items marked read in this visit (the server knows too - this shows it straight away)
  const [readHere, setReadHere] = useState({});
  // a notification opened in the pop-up (one without its own page)
  const [detailItem, setDetailItem] = useState(null);
  const [toasts, setToasts] = useState([]);
  const notifRef = useRef(null);
  // ids already shown, so only notifications that arrive later pop up as a toast
  const knownIdsRef = useRef(null);

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
        // no pop-up for a chat you are looking at right now
        const fresh = personalData
          .filter((item) => !knownIdsRef.current.has(item.id) && item.link !== window.location.pathname)
          .slice(0, 3);
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
    setReadHere({});
    setDismissedVersions({});
  }, [userId]);

  // going to another page closes the bell
  useEffect(() => {
    setIsNotifOpen(false);
  }, [location.pathname]);

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

  // when the user logs in, load the bell (read and cleared items come from MySQL)
  useEffect(() => {
    if (!isLoggedIn) return;
    loadNotifications();
  }, [isLoggedIn, loadNotifications]);

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
      isRead: item.isRead,
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
      isRead: item.isRead,
      effectiveDate: item.sentAt,
    })),
  ].sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

  // hide dismissed notifications
  const visibleItems = feedItems.filter((item) => (dismissedVersions[item.feedId] ?? 0) < item.version);

  // is this item read? (read / unread is kept in MySQL)
  function isItemRead(item) {
    if ((readHere[item.feedId] ?? 0) >= item.version) return true;
    return item.isRead === true;
  }

  // count unread for the bell badge
  const unreadCount = visibleItems.filter((item) => !isItemRead(item)).length;
  const readCount = visibleItems.length - unreadCount;

  // bell btn - open or close the panel
  function toggleNotifications() {
    const opening = !isNotifOpen;
    setIsNotifOpen(opening);
    if (opening) loadNotifications();
  }

  // one item is read - shown at once, saved on the server for every device
  function markItemRead(item) {
    if (isItemRead(item)) return;
    setReadHere((prev) => ({ ...prev, [item.feedId]: item.version }));
    const saved = item.kind === 'notification' ? markMyNotificationRead(item.id) : markMyAnnouncementRead(item.id, item.version);
    saved.catch(() => {
      // offline - it is still shown as read here
    });
  }

  // mark all as read btn
  function markAllRead() {
    setReadHere((prev) => {
      const next = { ...prev };
      visibleItems.forEach((item) => {
        next[item.feedId] = item.version;
      });
      return next;
    });
    markAllMyNotificationsRead().catch(() => {
      // offline - shown as read here anyway
    });
  }

  // delete read btn - clear what is read, keep what is new (saved in MySQL)
  function deleteReadNotifications() {
    const readItems = visibleItems.filter((item) => isItemRead(item));
    setDismissedVersions((prev) => {
      const next = { ...prev };
      readItems.forEach((item) => {
        next[item.feedId] = item.version;
      });
      return next;
    });
    clearMyReadNotifications().catch(() => {
      // offline - hidden on this screen until the next load
    });
  }

  // clear btn - hide one notification for good (saved in MySQL, so every device hides it)
  function dismissNotification(item) {
    setDismissedVersions((prev) => ({ ...prev, [item.feedId]: item.version }));
    const saved =
      item.kind === 'notification' ? dismissMyNotification(item.id) : dismissMyAnnouncement(item.id, item.version);
    saved.catch(() => {
      // offline - hidden on this screen until the next load
    });
  }

  // clear all btn - hide every notification, on every device
  function clearAllNotifications() {
    setDismissedVersions((prev) => {
      const next = { ...prev };
      visibleItems.forEach((item) => {
        next[item.feedId] = item.version;
      });
      return next;
    });
    clearMyNotifications().catch(() => {
      // offline - hidden on this screen until the next load
    });
  }

  // click a notification - it is read; open the page it is about (that page highlights the item), else show it in full
  function openNotification(item) {
    markItemRead(item);
    setIsNotifOpen(false);
    setToasts([]);
    if (item.link) {
      navigate(item.link);
      return;
    }
    setDetailItem(item);
  }

  // a pop-up toast as a bell item
  function feedItemOfToast(toast) {
    return (
      feedItems.find((item) => item.feedId === `notif:${toast.id}`) || {
        feedId: `notif:${toast.id}`,
        id: toast.id,
        link: toast.link || null,
        kind: 'notification',
        type: toast.type,
        title: toast.title,
        body: toast.message,
        version: 1,
        isRead: toast.isRead,
        effectiveDate: toast.sentAt,
      }
    );
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

  // the logged-in top bar
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
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={isNotifOpen}
            onClick={toggleNotifications}
          >
            <Icon name="bell" size={18} />
            {unreadCount > 0 && <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {isNotifOpen && (
            <div className="notification-panel">
              <div className="notification-panel-header flex-between">
                <span>
                  Notifications{unreadCount > 0 && <span className="notification-new-count">{unreadCount} new</span>}
                </span>
              </div>

              {/* the bell's buttons - mark all as read, delete read, delete all */}
              {visibleItems.length > 0 && (
                <div className="notification-actions">
                  <button type="button" onClick={markAllRead} disabled={unreadCount === 0}>
                    <Icon name="checkCircle" size={13} /> Mark all as read
                  </button>
                  <button type="button" onClick={deleteReadNotifications} disabled={readCount === 0}>
                    <Icon name="trash" size={13} /> Delete read
                  </button>
                  <button type="button" className="is-danger" onClick={clearAllNotifications}>
                    <Icon name="trash" size={13} /> Delete all
                  </button>
                </div>
              )}

              {visibleItems.length === 0 ? (
                <p className="notification-empty">You&apos;re all caught up - nothing new yet.</p>
              ) : (
                visibleItems.map((item) => {
                  const unread = !isItemRead(item);
                  return (
                    // every notification opens when clicked - its page, or the full text
                    <div
                      key={item.feedId}
                      className={`notification-item is-link${unread ? ' is-unread' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${unread ? 'Unread: ' : ''}${item.title}`}
                      onClick={() => openNotification(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openNotification(item);
                        }
                      }}
                    >
                      <div className="notification-item-title">
                        {unread && <span className="unread-dot" aria-hidden="true" />}
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
                          aria-label="Delete this notification"
                          title="Delete"
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
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* a notification without its own page, shown in full */}
        {detailItem && (
          <div className="modal-overlay" onClick={() => setDetailItem(null)}>
            <div
              className="modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notification-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <ModalClose onClose={() => setDetailItem(null)} />
              <div className="notification-detail-head">
                <Icon name={styleFor(detailItem).icon} size={18} />
                <h2 id="notification-detail-title">{detailItem.title}</h2>
              </div>
              <p className="notification-detail-body">{detailItem.body}</p>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                {new Date(detailItem.effectiveDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    dismissNotification(detailItem);
                    setDetailItem(null);
                  }}
                >
                  <Icon name="trash" size={15} /> Delete
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setDetailItem(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className="toast">
                <Icon name={toast.type === 'REMINDER' ? 'clock' : styleFor({ kind: 'notification', type: toast.type }).icon} size={18} />
                <button
                  type="button"
                  className="toast-main"
                  onClick={() => openNotification(feedItemOfToast(toast))}
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

export default MemberNavbar;
