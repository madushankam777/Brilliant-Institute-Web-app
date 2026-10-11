// Admin: messages sent from the public Contact Us page.
import { useCallback, useEffect, useState } from 'react';
import { fetchContactMessages, setContactMessageStatus } from '../../api/contactApi';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';
import useHighlight from '../../../../shared/client/src/hooks/useHighlight';

// the status tabs
const FILTERS = [
  { key: 'NEW', label: 'New' },
  { key: 'HANDLED', label: 'Handled' },
  { key: '', label: 'All' },
];

// the words shown for each topic
const TOPIC_LABELS = {
  ADMISSIONS: 'Joining',
  CLASSES: 'Classes',
  FEES: 'Fees',
  TECHNICAL: 'Website help',
  OTHER: 'Other',
};

// a date and time as, for example, 12 Oct 2026, 3:30 PM
function formatDateTime(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// enquiries - messages from the public Contact Us page; the admin marks them handled
function EnquiriesPage() {
  const { user } = useAuth();
  // the tab, the messages and the page state
  const [filter, setFilter] = useState('NEW');
  const [messages, setMessages] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  // the message a notification pointed at
  const highlightId = useHighlight(!isLoading);

  // load the messages for the chosen tab
  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchContactMessages(filter);
      setMessages(data.messages);
      setNewCount(data.newCount);
    } catch (loadError) {
      setError(loadError.message);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  // reload when the tab changes
  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  // mark handled / reopen btn - change a message's status
  async function changeStatus(message, status) {
    setBusyId(message.id);
    setError('');
    try {
      await setContactMessageStatus(message.id, status);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyId(null);
    }
  }

  // the page - title, status tabs and one card per message
  return (
    <PortalShell navItems={getNavItems(user.role)}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Enquiries</h1>
            <p className="muted">
              Messages from the public Contact Us page. Reply by email or phone, then mark them handled.
              {newCount > 0 && ` ${newCount} new.`}
            </p>
          </div>
          <ReportLink type="enquiries" label="Enquiries report" />
        </div>

        {/* status tabs - New, Handled, All */}
        <div className="choice-group" style={{ marginBottom: '18px' }}>
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`choice-pill${filter === item.key ? ' is-checked' : ''}`}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {item.key === 'NEW' && newCount > 0 ? ` (${newCount})` : ''}
            </button>
          ))}
        </div>

        <Alert type="error" message={error} />

        {/* a spinner, an empty message, or one card per message */}
        {isLoading ? (
          <LoadingSpinner label="Loading messages..." />
        ) : messages.length === 0 ? (
          !error && (
            <div className="card empty-state">
              <Icon name="inbox" size={32} />
              <p className="muted">{filter === 'NEW' ? 'No new messages - you are all caught up.' : 'No messages here.'}</p>
            </div>
          )
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`card enquiry${message.status === 'NEW' ? ' is-new' : ''}${message.id === highlightId ? ' row-highlight' : ''}`}
            >
              <div className="flex-between">
                <div>
                  <strong>{message.fullName}</strong>
                  <span className="badge" style={{ marginLeft: '8px' }}>
                    {TOPIC_LABELS[message.topic] || message.topic}
                  </span>
                  {message.status === 'NEW' && (
                    <span className="badge badge-warning" style={{ marginLeft: '6px' }}>
                      New
                    </span>
                  )}
                </div>
                <span className="order-line-sub">{formatDateTime(message.createdAt)}</span>
              </div>

              <p className="enquiry-message">{message.message}</p>

              {/* contact links, and the Mark handled / Reopen btn */}
              <div className="enquiry-footer">
                <div className="enquiry-contacts">
                  <a href={`mailto:${message.email}?subject=${encodeURIComponent('Re: your message to Brilliant Institute')}`}>
                    <Icon name="mail" size={14} /> {message.email}
                  </a>
                  {message.phone && (
                    <a href={`tel:${message.phone.replace(/[^0-9+]/g, '')}`}>
                      <Icon name="phone" size={14} /> {message.phone}
                    </a>
                  )}
                </div>
                {/* mark handled btn for a new message; handled by and a reopen btn after that */}
                {message.status === 'NEW' ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === message.id}
                    onClick={() => changeStatus(message, 'HANDLED')}
                  >
                    <Icon name="checkCircle" size={14} /> {busyId === message.id ? 'Saving...' : 'Mark handled'}
                  </button>
                ) : (
                  <span className="order-line-sub">
                    Handled{message.handledByName ? ` by ${message.handledByName}` : ''}
                    {message.handledAt ? ` · ${formatDateTime(message.handledAt)}` : ''}{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === message.id}
                      onClick={() => changeStatus(message, 'NEW')}
                    >
                      Reopen
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PortalShell>
  );
}

export default EnquiriesPage;
