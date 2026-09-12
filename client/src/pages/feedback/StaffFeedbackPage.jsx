// Tutor/Admin: view and respond to tickets addressed to them (FBC-03, FBC-04)
import { useCallback, useEffect, useState } from 'react';
import { fetchAllTickets, replyToTicket, resolveTicket } from '../../api/feedbackApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'RESOLVED', label: 'Resolved' },
];

function statusBadgeClass(status) {
  if (status === 'RESOLVED') return 'badge badge-success';
  if (status === 'IN_PROGRESS') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function recipientLabel(ticket) {
  if (ticket.recipientType === 'ADMIN') return 'Admin';
  if (ticket.recipientType === 'TUTOR') return ticket.recipientTutorName || 'Tutor';
  return `Admin & ${ticket.recipientTutorName || 'Tutor'}`;
}

function formatTime(isoDate) {
  return new Date(isoDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function StaffFeedbackPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [filter, setFilter] = useState('ALL');
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchAllTickets(filter === 'ALL' ? undefined : filter);
      setTickets(data);
      setSelectedId((current) => current || (data[0] && data[0].id) || null);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) || null;

  async function handleReply(event) {
    event.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setActionError('');
    setIsReplying(true);
    try {
      await replyToTicket(selectedTicket.id, replyText.trim());
      setReplyText('');
      await load();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsReplying(false);
    }
  }

  async function handleResolve() {
    if (!selectedTicket) return;
    setActionError('');
    setIsResolving(true);
    try {
      await resolveTicket(selectedTicket.id);
      await load();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>{user.role === 'ADMIN' ? 'Feedback & Messages' : 'My Messages'}</h1>
          <p className="muted">Conversations addressed to you - reply like a chat, and resolve once handled.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setFilter(item.key);
                setSelectedId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading tickets..." />
        ) : tickets.length === 0 ? (
          <p className="muted">No messages addressed to you in this view.</p>
        ) : (
          <div className="checkout-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className="card"
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    marginBottom: 0,
                    border: selectedId === ticket.id ? '1.5px solid var(--color-primary)' : undefined,
                  }}
                >
                  <div className="flex-between" style={{ marginBottom: '4px' }}>
                    <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700 }}>{ticket.ticketNumber}</span>
                    <span className={statusBadgeClass(ticket.status)}>{ticket.status.replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontWeight: 700 }}>{ticket.submittedByName}</div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>{ticket.subject}</div>
                  <div className="muted" style={{ fontSize: '0.78rem', marginTop: '2px' }}>To: {recipientLabel(ticket)}</div>
                </button>
              ))}
            </div>

            <div className="card">
              {!selectedTicket ? (
                <p className="muted">Select a ticket to view its details.</p>
              ) : (
                <>
                  <div className="flex-between" style={{ marginBottom: '6px' }}>
                    <h2 style={{ margin: 0 }}>
                      {selectedTicket.submittedByName} &mdash; {selectedTicket.category}
                    </h2>
                    {selectedTicket.status !== 'RESOLVED' && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={isResolving} onClick={handleResolve}>
                        {isResolving ? 'Resolving...' : 'Mark as Resolved'}
                      </button>
                    )}
                  </div>
                  <p className="muted" style={{ fontSize: '0.9rem' }}>
                    Subject: {selectedTicket.subject} &middot; To: {recipientLabel(selectedTicket)}
                  </p>

                  <Alert type="error" message={actionError} />

                  <div className="chat-thread">
                    <div className="chat-bubble-row">
                      <Avatar name={selectedTicket.submittedByName} size={28} />
                      <div className="chat-bubble">
                        <div className="chat-bubble-meta">{selectedTicket.submittedByName}</div>
                        <div className="chat-bubble-text">{selectedTicket.message}</div>
                        <span className="chat-bubble-time">{formatTime(selectedTicket.createdAt)}</span>
                      </div>
                    </div>
                    {selectedTicket.responses.map((response, index) => {
                      const isOwn = response.authorId === user.id;
                      return (
                        <div key={index} className={`chat-bubble-row${isOwn ? ' own' : ''}`}>
                          <Avatar name={response.authorName} size={28} />
                          <div className="chat-bubble">
                            <div className="chat-bubble-meta">
                              {isOwn ? 'You' : response.authorName} &middot; {response.authorRole.replace('_', '/')}
                            </div>
                            <div className="chat-bubble-text">{response.message}</div>
                            <span className="chat-bubble-time">{formatTime(response.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {selectedTicket.status === 'RESOLVED' ? (
                    <div style={{ marginTop: '14px' }}>
                      <Alert
                        type="success"
                        message="This conversation has been marked as resolved, so replies are closed. Ask the sender to raise a new ticket if the issue comes back."
                      />
                    </div>
                  ) : (
                    <form onSubmit={handleReply} style={{ marginTop: '14px' }}>
                      <div className="form-field">
                        <textarea
                          placeholder="Write your reply here..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          style={{ minHeight: '90px' }}
                        />
                      </div>
                      <div className="flex-between">
                        <button type="submit" className="btn btn-primary" disabled={isReplying || !replyText.trim()}>
                          {isReplying ? 'Sending...' : 'Send Reply'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={isResolving}
                          onClick={handleResolve}
                        >
                          {isResolving ? 'Resolving...' : 'Mark Problem Solved'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default StaffFeedbackPage;
