// Tutor/Admin: view and respond to tickets addressed to them (FBC-03, FBC-04); tutors also send their own to the office
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  announceFeedbackChanged,
  fetchAllTickets,
  fetchMyTickets,
  hideTicket,
  markTicketRead,
  replyToTicket,
  resolveTicket,
  submitFeedback,
  updateAllTickets,
} from '../../api/feedbackApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import CategoryBadge from '../../../../shared/client/src/components/common/CategoryBadge';
import ConfirmDialog from '../../../../shared/client/src/components/common/ConfirmDialog';
import Icon from '../../../../shared/client/src/components/common/Icon';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import {
  STUDENT_CATEGORIES,
  TUTOR_CATEGORIES,
  categoryTone,
} from '../../../../shared/client/src/constants/feedbackCategories';
import { useAuth } from '../../context/AuthContext';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';
import CategoryPicker from './CategoryPicker';
import TicketList from './TicketList';

// the status tabs
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'RESOLVED', label: 'Resolved' },
];

// every category, in the order they are shown in the filter
const ALL_CATEGORIES = [...new Set([...STUDENT_CATEGORIES, ...TUTOR_CATEGORIES])];

// what each delete button asks first
const BULK_CONFIRM = {
  'clear-read': {
    title: 'Delete read tickets?',
    text: 'Every ticket you have read is removed from your list. Nothing is deleted for the sender or from the reports, and a new reply brings a ticket back.',
  },
  'clear-all': {
    title: 'Delete all tickets?',
    text: 'All tickets in this list are removed from your list. Nothing is deleted for the sender or from the reports, and a new reply brings a ticket back.',
  },
};

// who a ticket was sent to, as text
function recipientLabel(ticket) {
  if (ticket.recipientType === 'ADMIN') return 'Admin';
  if (ticket.recipientType === 'TUTOR') return ticket.recipientTutorName || 'Tutor';
  return `Admin & ${ticket.recipientTutorName || 'Tutor'}`;
}

// a date and time as, for example, 12 Oct 2026, 3:30 PM
function formatTime(isoDate) {
  return new Date(isoDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// a blank feedback form for a tutor
const EMPTY_FORM = { category: '', subject: '', message: '' };

// my messages - a tutor or admin reads the tickets sent to them, replies like a chat and resolves them
function StaffFeedbackPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const isTutor = user.role === 'TUTOR';
  const [searchParams, setSearchParams] = useSearchParams();

  // which list (a tutor also has the tickets they sent), the tabs and the tickets
  const [box, setBox] = useState(isTutor && searchParams.get('box') === 'sent' ? 'sent' : 'inbox');
  const [filter, setFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // the reply box and its state
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [actionError, setActionError] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const detailRef = useRef(null);

  // delete buttons - "are you sure?"
  const [confirm, setConfirm] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  // a tutor's new feedback to the office
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSending, setIsSending] = useState(false);

  // the ticket is read - here, and on the server
  const markRead = useCallback((ticket) => {
    if (!ticket || ticket.unreadCount === 0) return;
    setTickets((rows) => rows.map((row) => (row.id === ticket.id ? { ...row, unreadCount: 0 } : row)));
    markTicketRead(ticket.id)
      .then(announceFeedbackChanged)
      .catch(() => {
        // not critical - it is marked read next time
      });
  }, []);

  // on a phone the conversation sits below the list, so bring it into view
  function openTicket(ticketId) {
    setSelectedId(ticketId);
    setActionError('');
    markRead(tickets.find((ticket) => ticket.id === ticketId));
    if (detailRef.current && window.innerWidth < 1024) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // load the tickets for the chosen list and tab
  const load = useCallback(async () => {
    setLoadError('');
    try {
      let data;
      if (box === 'sent') {
        const mine = await fetchMyTickets();
        data = filter === 'ALL' ? mine : mine.filter((ticket) => ticket.status === filter);
      } else {
        data = await fetchAllTickets(filter === 'ALL' ? undefined : filter);
      }
      setTickets(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [box, filter]);

  // reload when the list or the tab changes
  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  // ?ticket=ID - a notification opens that ticket
  useEffect(() => {
    const ticketId = Number(searchParams.get('ticket'));
    if (!ticketId || isLoading) return;
    const ticket = tickets.find((row) => row.id === ticketId);
    if (ticket) {
      setSelectedId(ticketId);
      markRead(ticket);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, isLoading, tickets, markRead]);

  // the tickets in the chosen category, and the ticket open on the right
  const shownTickets = categoryFilter ? tickets.filter((ticket) => ticket.category === categoryFilter) : tickets;
  const usedCategories = ALL_CATEGORIES.filter((category) => tickets.some((ticket) => ticket.category === category));
  const selectedTicket = shownTickets.find((ticket) => ticket.id === selectedId) || null;

  // send reply btn - add my reply to the conversation
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

  // mark as resolved btn - close the conversation
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

  // delete one, delete read, delete all, or mark all read - only for me
  async function runAction(action) {
    setIsWorking(true);
    setNotice('');
    setLoadError('');
    try {
      if (action.type === 'one') {
        await hideTicket(action.ticket.id);
        if (selectedId === action.ticket.id) setSelectedId(null);
        setNotice(`${action.ticket.ticketNumber} was removed from your list.`);
      } else {
        const result = await updateAllTickets(action.type, box);
        if (action.type === 'read-all') setNotice('All tickets are marked as read.');
        else {
          setNotice(result.changed > 0 ? `${result.changed} ticket${result.changed === 1 ? '' : 's'} removed from your list.` : 'Nothing to delete.');
          setSelectedId(null);
        }
      }
      await load();
      announceFeedbackChanged();
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsWorking(false);
      setConfirm(null);
    }
  }

  // a delete button - ask first
  function askBulk(type) {
    if (type === 'read-all') {
      runAction({ type });
      return;
    }
    setConfirm({ type, ...BULK_CONFIRM[type] });
  }

  // switch between "sent to me" and "sent by me" (tutors)
  function switchBox(next) {
    setBox(next);
    setFilter('ALL');
    setCategoryFilter('');
    setSelectedId(null);
    setNotice('');
  }

  // send btn - a tutor's feedback to the office
  async function handleSendFeedback(event) {
    event.preventDefault();
    const errors = {};
    if (!form.category) errors.category = 'Please choose what your message is about.';
    if (form.subject.trim().length < 3) errors.subject = 'Please enter a short subject.';
    if (form.message.trim().length < 10) errors.message = 'Please describe it in at least 10 characters.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSending(true);
    setFormError('');
    try {
      const ticket = await submitFeedback({
        category: form.category,
        recipientType: 'ADMIN',
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setIsNewOpen(false);
      setForm(EMPTY_FORM);
      setNotice(`Ticket ${ticket.ticketNumber} was sent to the office.`);
      if (box === 'sent') await load();
      else switchBox('sent');
      setSelectedId(ticket.id);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSending(false);
    }
  }

  // the page - title, list switch, status tabs, category colours, the ticket list and the open conversation
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>{user.role === 'ADMIN' ? 'Feedback & Complaints' : 'Feedback'}</h1>
            <p className="muted">
              {isTutor
                ? 'Tickets from your students, and the feedback you send to the office - reply like a chat.'
                : 'Tickets addressed to the office - reply like a chat, and resolve once handled.'}
            </p>
          </div>
          {user.role === 'ADMIN' && <ReportLink type="feedback" label="Feedback report" />}
          {isTutor && (
            <button type="button" className="btn btn-primary" onClick={() => setIsNewOpen(true)}>
              <Icon name="plus" size={16} /> New feedback to the office
            </button>
          )}
        </div>

        {/* a tutor's two lists */}
        {isTutor && (
          <div className="segmented" style={{ maxWidth: '420px', marginBottom: '14px' }}>
            <button type="button" className={box === 'inbox' ? 'active' : ''} onClick={() => switchBox('inbox')}>
              Sent to me
            </button>
            <button type="button" className={box === 'sent' ? 'active' : ''} onClick={() => switchBox('sent')}>
              Sent by me
            </button>
          </div>
        )}

        {/* status tabs - All, Pending, In Progress, Resolved */}
        <div className="choice-group" style={{ marginBottom: '12px' }}>
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`choice-pill${filter === item.key ? ' is-checked' : ''}`}
              aria-pressed={filter === item.key}
              onClick={() => {
                setFilter(item.key);
                setSelectedId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* category colours - also a filter */}
        {usedCategories.length > 1 && (
          <div className="category-filter" role="group" aria-label="Filter by category">
            <button
              type="button"
              className={`category-chip tone-grey${categoryFilter === '' ? ' is-checked' : ''}`}
              aria-pressed={categoryFilter === ''}
              onClick={() => setCategoryFilter('')}
            >
              All categories
            </button>
            {usedCategories.map((category) => (
              <button
                key={category}
                type="button"
                className={`category-chip tone-${categoryTone(category)}${categoryFilter === category ? ' is-checked' : ''}`}
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(categoryFilter === category ? '' : category)}
              >
                <span className="category-dot" aria-hidden="true" />
                {category} ({tickets.filter((ticket) => ticket.category === category).length})
              </button>
            ))}
          </div>
        )}

        <Alert type="success" message={notice} />
        <Alert type="error" message={loadError} />

        {/* a spinner, an empty message, or the ticket list and the conversation */}
        {isLoading ? (
          <LoadingSpinner label="Loading tickets..." />
        ) : shownTickets.length === 0 ? (
          <p className="muted">
            {box === 'sent' ? 'You have not sent any feedback in this view.' : 'No tickets addressed to you in this view.'}
          </p>
        ) : (
          <div className="checkout-grid">
            {/* ticket list - coloured by category, with the delete buttons */}
            <TicketList
              tickets={shownTickets}
              selectedId={selectedId}
              onOpen={openTicket}
              onDelete={(ticket) =>
                setConfirm({
                  type: 'one',
                  ticket,
                  title: `Delete ${ticket.ticketNumber}?`,
                  text: 'It is removed from your list only. The sender and the reports keep it, and a new reply brings it back.',
                })
              }
              onBulk={askBulk}
              isWorking={isWorking}
              describe={(ticket) =>
                box === 'sent' ? `To: ${recipientLabel(ticket)}` : `From ${ticket.submittedByName} · To: ${recipientLabel(ticket)}`
              }
            />

            {/* the open conversation */}
            <div className="card" ref={detailRef} style={{ scrollMarginTop: '84px' }}>
              {!selectedTicket ? (
                <p className="muted">Select a ticket to view its details.</p>
              ) : (
                <>
                  <div className="ticket-head">
                    <h2>
                      {box === 'sent' ? selectedTicket.subject : selectedTicket.submittedByName}
                      <CategoryBadge category={selectedTicket.category} />
                    </h2>
                    {/* mark as resolved btn - only for tickets sent to me, while open */}
                    {box === 'inbox' && selectedTicket.status !== 'RESOLVED' && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={isResolving} onClick={handleResolve}>
                        {isResolving ? 'Resolving...' : 'Mark as Resolved'}
                      </button>
                    )}
                  </div>
                  <p className="muted" style={{ fontSize: '0.9rem' }}>
                    {selectedTicket.ticketNumber} &middot; Subject: {selectedTicket.subject} &middot; To:{' '}
                    {recipientLabel(selectedTicket)}
                  </p>

                  <Alert type="error" message={actionError} />

                  {/* the messages - the first message, then the replies */}
                  <div className="chat-thread">
                    <div className={`chat-bubble-row${selectedTicket.submittedBy === user.id ? ' own' : ''}`}>
                      <Avatar name={selectedTicket.submittedByName} size={28} />
                      <div className="chat-bubble">
                        <div className="chat-bubble-meta">
                          {selectedTicket.submittedBy === user.id ? 'You' : selectedTicket.submittedByName}
                        </div>
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

                  {/* resolved tickets open again when the sender writes; staff can still add a note */}
                  {selectedTicket.status === 'RESOLVED' && (
                    <p className="field-help" style={{ marginTop: '12px' }}>
                      {box === 'sent'
                        ? 'This ticket is resolved. Writing a reply opens it again for the office.'
                        : 'This ticket is resolved. If the sender writes again, it opens again here.'}
                    </p>
                  )}
                  <form onSubmit={handleReply} style={{ marginTop: '14px' }}>
                    <div className="form-field">
                      <textarea
                        placeholder="Write your reply here..."
                        aria-label="Your reply"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        style={{ minHeight: '90px' }}
                        maxLength={4000}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isReplying || !replyText.trim()}>
                      {isReplying ? 'Sending...' : 'Send Reply'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* are you sure? (deleting) */}
        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            text={confirm.text}
            isBusy={isWorking}
            onConfirm={() => runAction(confirm)}
            onCancel={() => setConfirm(null)}
          />
        )}

        {/* a tutor's new feedback to the office - the tutor categories */}
        {isNewOpen && (
          <div className="modal-overlay" onClick={() => !isSending && setIsNewOpen(false)}>
            <div
              className="modal-dialog new-message-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-feedback-title"
              onClick={(event) => event.stopPropagation()}
            >
              <ModalClose onClose={() => setIsNewOpen(false)} disabled={isSending} />
              <h2 id="new-feedback-title">Feedback to the office</h2>
              <form onSubmit={handleSendFeedback} noValidate>
                <CategoryPicker
                  categories={TUTOR_CATEGORIES}
                  value={form.category}
                  onChange={(category) => setForm((previous) => ({ ...previous, category }))}
                  error={formErrors.category}
                />
                <div className="form-field">
                  <label htmlFor="feedback-subject">Subject</label>
                  <input
                    id="feedback-subject"
                    type="text"
                    placeholder="e.g. Projector in Hall B is not working"
                    value={form.subject}
                    onChange={(e) => setForm((previous) => ({ ...previous, subject: e.target.value }))}
                    maxLength={200}
                  />
                  {formErrors.subject && <p className="field-error">{formErrors.subject}</p>}
                </div>
                <div className="form-field">
                  <label htmlFor="feedback-message">Message</label>
                  <textarea
                    id="feedback-message"
                    placeholder="Describe what you need from the office..."
                    value={form.message}
                    onChange={(e) => setForm((previous) => ({ ...previous, message: e.target.value }))}
                    style={{ minHeight: '120px' }}
                    maxLength={4000}
                  />
                  {formErrors.message && <p className="field-error">{formErrors.message}</p>}
                </div>
                <Alert type="error" message={formError} />
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setIsNewOpen(false)} disabled={isSending}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSending}>
                    <Icon name="send" size={15} /> {isSending ? 'Sending...' : 'Send to the office'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default StaffFeedbackPage;
