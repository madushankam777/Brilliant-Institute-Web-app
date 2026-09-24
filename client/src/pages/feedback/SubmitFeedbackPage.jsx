// Student/Parent or Tutor: submit feedback/complaint (FBC-01), route it to
// Admin/Tutor/both, and keep the conversation going like a chat (FBC-02)
import { useCallback, useEffect, useState } from 'react';
import {
  submitFeedback,
  fetchMyTickets,
  fetchTicketDetails,
  replyToTicket,
} from '../../api/feedbackApi';
import { fetchAllTutors } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = [
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
];

const RECIPIENT_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'ADMIN_TUTOR', label: 'Admin & Tutor' },
  { value: 'TUTOR', label: 'Tutor' },
];

function statusBadgeClass(status) {
  if (status === 'RESOLVED') return 'badge badge-success';
  if (status === 'IN_PROGRESS') return 'badge badge-warning';
  return 'badge badge-neutral';
}

function statusLabel(status) {
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'RESOLVED') return 'Resolved';
  return 'Pending';
}

function recipientLabel(ticket) {
  if (ticket.recipientType === 'ADMIN') return 'To: Admin';
  if (ticket.recipientType === 'TUTOR') return `To: ${ticket.recipientTutorName || 'Tutor'}`;
  return `To: Admin & ${ticket.recipientTutorName || 'Tutor'}`;
}

function formatTime(isoDate) {
  return new Date(isoDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const emptyForm = { category: CATEGORIES[1], recipientType: 'ADMIN', recipientTutorId: null, subject: '', message: '' };

function SubmitFeedbackPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tutors, setTutors] = useState([]);

  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [openTicket, setOpenTicket] = useState(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState('');

  const loadTickets = useCallback(async () => {
    setIsLoadingTickets(true);
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

  useEffect(() => {
    loadTickets();
    fetchAllTutors()
      .then(setTutors)
      .catch(() => {
        // The tutor picker just stays empty - submitting to Admin only
        // still works fine without this list.
      });
  }, [loadTickets]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const errors = {};
    if (form.subject.trim().length < 3) errors.subject = 'Please enter a short subject.';
    if (form.message.trim().length < 10) errors.message = 'Please describe the issue in a bit more detail.';
    if (form.recipientType !== 'ADMIN' && !form.recipientTutorId) {
      errors.recipientTutorId = 'Please select which Tutor this message is for.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const ticket = await submitFeedback(form);
      setSubmitSuccess(`Ticket ${ticket.ticketNumber} submitted successfully.`);
      setForm(emptyForm);
      await loadTickets();
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setFieldErrors(mapped);
        setSubmitError('');
      } else {
        setSubmitError(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openThread(ticketId) {
    setOpenTicket(null);
    setReplyError('');
    setReplyText('');
    setIsLoadingThread(true);
    try {
      const ticket = await fetchTicketDetails(ticketId);
      setOpenTicket(ticket);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoadingThread(false);
    }
  }

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

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Feedback &amp; Support</h1>
          <p className="muted">Message Admin, a Tutor, or both - and keep the conversation going like a chat.</p>
        </div>

        <div className="checkout-grid">
          <div className="card">
            <h2>Send a New Message</h2>
            <Alert type="success" message={submitSuccess} />
            <Alert type="error" message={submitError} />

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-field">
                <label htmlFor="category">Subject Category</label>
                <select id="category" value={form.category} onChange={(e) => updateField('category', e.target.value)}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

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

              {form.recipientType !== 'ADMIN' && (
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

              <div className="form-field">
                <label htmlFor="subject">Subject</label>
                <input
                  id="subject"
                  type="text"
                  placeholder="A short summary of the issue"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                />
                {fieldErrors.subject && <p className="field-error">{fieldErrors.subject}</p>}
              </div>

              <div className="form-field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  placeholder="Type your comments, queries, tutor feedback, or technical issues here..."
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  style={{ minHeight: '130px' }}
                />
                {fieldErrors.message && <p className="field-error">{fieldErrors.message}</p>}
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>

          <div className="card">
            <h2>My Conversations</h2>
            <Alert type="error" message={loadError} />
            {isLoadingTickets ? (
              <LoadingSpinner label="Loading your tickets..." />
            ) : tickets.length === 0 ? (
              <p className="muted">You haven&apos;t sent any messages yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openThread(ticket.id)}
                    style={{
                      textAlign: 'left',
                      background: openTicket?.id === ticket.id ? 'var(--color-primary-soft)' : 'none',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius)',
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: '4px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>{ticket.ticketNumber}</span>
                      <span className={statusBadgeClass(ticket.status)}>{statusLabel(ticket.status)}</span>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: '2px' }}>{ticket.subject}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {ticket.category} &middot; {recipientLabel(ticket)} &middot; {ticket.responses.length} repl
                      {ticket.responses.length === 1 ? 'y' : 'ies'}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {isLoadingThread && <LoadingSpinner label="Loading conversation..." />}

            {openTicket && !isLoadingThread && (
              <div style={{ marginTop: '18px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>
                  {openTicket.subject} <span className="muted">({recipientLabel(openTicket)})</span>
                </h3>
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
                <form onSubmit={handleReplySubmit} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Type a reply..."
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
      </div>
    </PortalShell>
  );
}

export default SubmitFeedbackPage;
