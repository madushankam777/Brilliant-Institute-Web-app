// Admin: messages sent from the public Contact Us page.
import { useCallback, useEffect, useState } from 'react';
import { fetchContactMessages, setContactMessageStatus } from '../../api/contactApi';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const FILTERS = [
  { key: 'NEW', label: 'New' },
  { key: 'HANDLED', label: 'Handled' },
  { key: '', label: 'All' },
];

const TOPIC_LABELS = {
  ADMISSIONS: 'Joining',
  CLASSES: 'Classes',
  FEES: 'Fees',
  TECHNICAL: 'Website help',
  OTHER: 'Other',
};

function formatDateTime(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function EnquiriesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('NEW');
  const [messages, setMessages] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

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

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

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

  return (
    <PortalShell navItems={getNavItems(user.role)}>
      <div className="page">
        <div className="page-header">
          <h1>Enquiries</h1>
          <p className="muted">
            Messages from the public Contact Us page. Reply by email or phone, then mark them handled.
            {newCount > 0 && ` ${newCount} new.`}
          </p>
        </div>

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
            <div key={message.id} className={`card enquiry${message.status === 'NEW' ? ' is-new' : ''}`}>
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
