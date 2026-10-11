// Feedback page - send a message and chat with replies
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  announceFeedbackChanged,
  fetchMyTickets,
  fetchTicketDetails,
  hideTicket,
  markTicketRead,
  replyToTicket,
  submitFeedback,
  updateAllTickets,
} from '../../api/feedbackApi';
import { fetchAllTutors } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import CategoryBadge from '../../../../shared/client/src/components/common/CategoryBadge';
import ConfirmDialog from '../../../../shared/client/src/components/common/ConfirmDialog';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { categoriesFor } from '../../../../shared/client/src/constants/feedbackCategories';
import { useAuth } from '../../context/AuthContext';
import CategoryPicker from './CategoryPicker';
import TicketList from './TicketList';

// who a message can be sent to
const RECIPIENT_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'ADMIN_TUTOR', label: 'Admin & Tutor' },
  { value: 'TUTOR', label: 'Tutor' },
];

// what each delete button asks first
const BULK_CONFIRM = {
  'clear-read': {
    title: 'Delete read conversations?',
    text: 'Every conversation you have read is removed from your list. The office still keeps them, and a new reply brings one back.',
  },
  'clear-all': {
    title: 'Delete all conversations?',
    text: 'All conversations are removed from your list. The office still keeps them, and a new reply brings one back.',
  },
};

// who a ticket was sent to, as text
function recipientLabel(ticket) {
  if (ticket.recipientType === 'ADMIN') return 'To: Admin';
  if (ticket.recipientType === 'TUTOR') return `To: ${ticket.recipientTutorName || 'Tutor'}`;
  return `To: Admin & ${ticket.recipientTutorName || 'Tutor'}`;
}

// a date and time as, for example, 12 Oct 2026, 3:30 PM
function formatTime(isoDate) {
  return new Date(isoDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// a blank message form (the category is chosen with the coloured chips)
const emptyForm = { category: '', recipientType: 'ADMIN', recipientTutorId: null, subject: '', message: '' };

// feedback & support - send a message to the admin and/or a tutor, and chat with their replies
function SubmitFeedbackPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);
  const isTutor = user.role === 'TUTOR';
  const categories = categoriesFor(user.role);
  const [searchParams, setSearchParams] = useSearchParams();

  // the new message form
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // the tutors to choose from
  const [tutors, setTutors] = useState([]);

  // my conversations
  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  // the open conversation and the reply box
  const [openTicket, setOpenTicket] = useState(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState('');

  // delete buttons - "are you sure?"
  const [confirm, setConfirm] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  // load my conversations
  const loadTickets = useCallback(async () => {
    setLoadError('');
    try {
      const data = await fetchMyTickets();
      setTickets(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoadingTickets(false);
    }
  }, []);

  // click a conversation - load it with its replies, and it is read
  const openThread = useCallback(async (ticketId) => {
    setOpenTicket(null);
    setReplyError('');
    setReplyText('');
    setIsLoadingThread(true);
    try {
      const ticket = await fetchTicketDetails(ticketId);
      setOpenTicket(ticket);
      setTickets((rows) => rows.map((row) => (row.id === ticketId ? { ...row, unreadCount: 0 } : row)));
      markTicketRead(ticketId)
        .then(announceFeedbackChanged)
        .catch(() => {
          // not critical - it is marked read next time
        });
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  // load my conversations and the tutors when the page opens
  useEffect(() => {
    loadTickets();
    if (!isTutor) {
      fetchAllTutors()
        .then(setTutors)
        .catch(() => {
          // tutor list failed - sending to Admin still works
        });
    }
  }, [loadTickets, isTutor]);

  // ?ticket=ID - a notification opens that conversation
  useEffect(() => {
    const ticketId = Number(searchParams.get('ticket'));
    if (ticketId) {
      openThread(ticketId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, openThread]);

  // change one form field
  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  // send message btn - check the form, then send the message
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const errors = {};
    if (!form.category) errors.category = 'Please choose what your message is about.';
    if (form.subject.trim().length < 3) errors.subject = 'Please enter a short subject.';
    if (form.message.trim().length < 10) errors.message = 'Please describe the issue in a bit more detail.';
    if (!isTutor && form.recipientType !== 'ADMIN' && !form.recipientTutorId) {
      errors.recipientTutorId = 'Please select which Tutor this message is for.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const ticket = await submitFeedback(isTutor ? { ...form, recipientType: 'ADMIN', recipientTutorId: null } : form);
      setSubmitSuccess(`Ticket ${ticket.ticketNumber} submitted successfully.`);
      setForm(emptyForm);
      await loadTickets();
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => {
          if (d.field && !mapped[d.field]) mapped[d.field] = d.message;
        });
        setFieldErrors(mapped);
        setSubmitError('');
      } else {
        setSubmitError(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // send btn - add my reply to the open conversation
  async function handleReplySubmit(event) {
    event.preventDefault();
    if (!openTicket || !replyText.trim()) return;
    setReplyError('');
    setIsReplying(true);
    try {
      const updated = await replyToTicket(openTicket.id, replyText.trim());
      setOpenTicket(updated);
      setReplyText('');
      await loadTickets();
    } catch (error) {
      setReplyError(error.message);
    } finally {
      setIsReplying(false);
    }
  }

  // delete one, delete read, delete all, or mark all read
  async function runAction(action) {
    setIsWorking(true);
    setNotice('');
    setLoadError('');
    try {
      if (action.type === 'one') {
        await hideTicket(action.ticket.id);
        if (openTicket && openTicket.id === action.ticket.id) setOpenTicket(null);
        setNotice(`${action.ticket.ticketNumber} was removed from your list.`);
      } else {
        const result = await updateAllTickets(action.type, 'sent');
        if (action.type === 'read-all') setNotice('All conversations are marked as read.');
        else {
          setNotice(result.changed > 0 ? `${result.changed} conversation${result.changed === 1 ? '' : 's'} removed from your list.` : 'Nothing to delete.');
          setOpenTicket(null);
        }
      }
      await loadTickets();
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

  // the page - the new message form and my conversations
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>{isTutor ? 'Feedback to the Office' : 'Feedback & Support'}</h1>
          <p className="muted">
            {isTutor
              ? 'Raise a request or an issue with the office, and keep the conversation going like a chat.'
              : 'Message Admin, a Tutor, or both - and keep the conversation going like a chat.'}
          </p>
        </div>

        {/* two columns - a new message, and my conversations */}
        <div className="checkout-grid">
          {/* send a new message */}
          <div className="card">
            <h2>Send a New Message</h2>
            <Alert type="success" message={submitSuccess} />
            <Alert type="error" message={submitError} />

            <form onSubmit={handleSubmit} noValidate>
              {/* category - coloured chips */}
              <CategoryPicker
                categories={categories}
                value={form.category}
                onChange={(category) => updateField('category', category)}
                error={fieldErrors.category}
              />

              {/* who to send it to - admin, tutor or both (a tutor always writes to the office) */}
              {!isTutor && (
                <div className="form-field">
                  <label>Send To</label>
                  <div className="segmented">
                    {RECIPIENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={form.recipientType === option.value ? 'active' : ''}
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            recipientType: option.value,
                            recipientTutorId: option.value === 'ADMIN' ? null : previous.recipientTutorId,
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* tutor picker - needed when a tutor is included */}
              {!isTutor && form.recipientType !== 'ADMIN' && (
                <div className="form-field">
                  <label htmlFor="recipientTutorId">Which Tutor?</label>
                  <TutorPicker
                    tutors={tutors}
                    value={form.recipientTutorId}
                    onChange={(tutorId) => updateField('recipientTutorId', tutorId)}
                  />
                  {fieldErrors.recipientTutorId && <p className="field-error">{fieldErrors.recipientTutorId}</p>}
                </div>
              )}

              {/* subject */}
              <div className="form-field">
                <label htmlFor="subject">Subject</label>
                <input
                  id="subject"
                  type="text"
                  placeholder="A short summary of the issue"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  maxLength={200}
                />
                <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                  {form.subject.length}/200 characters
                </p>
                {fieldErrors.subject && <p className="field-error">{fieldErrors.subject}</p>}
              </div>

              {/* message */}
              <div className="form-field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  placeholder={
                    isTutor
                      ? 'Describe what you need from the office...'
                      : 'Type your comments, queries, tutor feedback, or technical issues here...'
                  }
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  style={{ minHeight: '130px' }}
                  maxLength={4000}
                />
                <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                  {form.message.length}/4000 characters
                </p>
                {fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
              </div>

              {/* send btn */}
              <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>

          {/* my conversations - the list, and the open conversation with a reply box */}
          <div className="card">
            <h2>My Conversations</h2>
            <Alert type="success" message={notice} />
            <Alert type="error" message={loadError} />
            {/* a spinner, an empty message, or the coloured ticket list */}
            {isLoadingTickets ? (
              <LoadingSpinner label="Loading your tickets..." />
            ) : tickets.length === 0 ? (
              <p className="muted">No conversations here. Send a message to start one.</p>
            ) : (
              <TicketList
                tickets={tickets}
                selectedId={openTicket ? openTicket.id : null}
                onOpen={openThread}
                onDelete={(ticket) =>
                  setConfirm({
                    type: 'one',
                    ticket,
                    title: `Delete ${ticket.ticketNumber}?`,
                    text: 'It is removed from your list only. The office still keeps it, and a new reply brings it back.',
                  })
                }
                onBulk={askBulk}
                isWorking={isWorking}
                describe={(ticket) =>
                  `${recipientLabel(ticket)} · ${ticket.responses.length} repl${ticket.responses.length === 1 ? 'y' : 'ies'}`
                }
              />
            )}

            {/* a spinner while the conversation loads */}
            {isLoadingThread && <LoadingSpinner label="Loading conversation..." />}

            {/* the open conversation - the messages and a reply box */}
            {openTicket && !isLoadingThread && (
              <div style={{ marginTop: '18px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                <div className="ticket-head">
                  <h3 style={{ fontSize: '0.95rem', margin: 0 }}>
                    {openTicket.subject} <span className="muted">({recipientLabel(openTicket)})</span>
                  </h3>
                  <CategoryBadge category={openTicket.category} />
                </div>
                {/* the messages */}
                <div className="chat-thread">
                  <div className="chat-bubble-row own">
                    <Avatar name={user.fullName} pictureUrl={user.profilePictureUrl} size={28} />
                    <div className="chat-bubble">
                      <div className="chat-bubble-meta">You</div>
                      <div className="chat-bubble-text">{openTicket.message}</div>
                      <span className="chat-bubble-time">{formatTime(openTicket.createdAt)}</span>
                    </div>
                  </div>
                  {openTicket.responses.map((response, index) => {
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

                <Alert type="error" message={replyError} />
                {openTicket.status === 'RESOLVED' && (
                  <p className="field-help" style={{ marginTop: '10px' }}>
                    This ticket is resolved. Writing a reply opens it again for the office.
                  </p>
                )}
                {/* reply form */}
                <form onSubmit={handleReplySubmit} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Type a reply..."
                    aria-label="Your reply"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ flex: 1 }}
                    maxLength={4000}
                  />
                  <button type="submit" className="btn btn-primary" disabled={isReplying || !replyText.trim()}>
                    {isReplying ? '...' : 'Send'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

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
      </div>
    </PortalShell>
  );
}

export default SubmitFeedbackPage;
