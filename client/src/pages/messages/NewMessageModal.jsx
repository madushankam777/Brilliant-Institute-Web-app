// new message pop-up - pick who to message (only people you are allowed to), then write the first message
import { useEffect, useState } from 'react';
import { fetchContacts, startConversation } from '../../api/messagesApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';

// the longest message
const MAX_LENGTH = 2000;

// what to say when nobody matches, for each role
const EMPTY_TEXT = {
  STUDENT_PARENT: 'Your tutors appear here once you are enrolled in their classes. You can always message the office.',
  TUTOR: 'Students appear here once they are enrolled in your classes. You can always message the office.',
  ADMIN: 'No active student or tutor matches that search.',
};

// one person in the list - the office has its own icon
function ContactAvatar({ contact }) {
  if (contact.role === 'OFFICE') {
    return (
      <span className="office-avatar" style={{ width: 36, height: 36 }} aria-hidden="true">
        <Icon name="inbox" size={17} />
      </span>
    );
  }
  return <Avatar name={contact.name} pictureUrl={contact.pictureUrl} size={36} />;
}

// the pop-up
function NewMessageModal({ role, initialTo, initialName, onClose, onSent }) {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // a "Message" button elsewhere can pick the person already
  const [selected, setSelected] = useState(
    initialTo ? { to: initialTo === 'OFFICE' ? 'OFFICE' : Number(initialTo), name: initialName || 'Selected person', role: '' } : null
  );
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // load (and search) the people I can message
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchContacts(search.trim());
        if (isCurrent) {
          setContacts(rows);
          setLoadError('');
        }
      } catch (error) {
        if (isCurrent) setLoadError(error.message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }, 250);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [search]);

  // send btn - start (or continue) the chat with its first message
  async function handleSend(event) {
    event.preventDefault();
    if (!selected || !body.trim()) return;
    setIsSending(true);
    setSendError('');
    try {
      const conversationId = await startConversation({ to: selected.to, body: body.trim() });
      onSent(conversationId);
    } catch (error) {
      setSendError(error.message);
      setIsSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !isSending && onClose()}>
      <div
        className="modal-dialog new-message-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-message-title"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalClose onClose={onClose} disabled={isSending} />
        <h2 id="new-message-title">New message</h2>

        {!selected ? (
          <>
            {/* step 1 - who to message */}
            <div className="form-field">
              <label htmlFor="contact-search">To</label>
              <input
                id="contact-search"
                type="search"
                placeholder={role === 'ADMIN' ? 'Search students and tutors by name, email or code...' : 'Search by name...'}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </div>
            <Alert type="error" message={loadError} />
            <div className="contact-list" role="listbox" aria-label="People you can message">
              {isLoading ? (
                <LoadingSpinner label="Loading..." />
              ) : contacts.length === 0 ? (
                <p className="muted contact-empty">{EMPTY_TEXT[role] || EMPTY_TEXT.STUDENT_PARENT}</p>
              ) : (
                contacts.map((contact) => (
                  <button
                    key={String(contact.to)}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="contact-item"
                    onClick={() => setSelected(contact)}
                  >
                    <ContactAvatar contact={contact} />
                    <span className="contact-text">
                      <span className="contact-name">{contact.name}</span>
                      <span className="contact-detail">{contact.detail}</span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                ))
              )}
            </div>
            {role === 'STUDENT_PARENT' && (
              <p className="field-help">For your privacy, students cannot message other students.</p>
            )}
          </>
        ) : (
          <form onSubmit={handleSend}>
            {/* step 2 - the message */}
            <div className="selected-contact">
              <ContactAvatar contact={selected} />
              <span className="contact-text">
                <span className="contact-name">To: {selected.name}</span>
                {selected.detail && <span className="contact-detail">{selected.detail}</span>}
              </span>
              <button type="button" className="link-button" onClick={() => setSelected(null)} disabled={isSending}>
                Change
              </button>
            </div>
            <div className="form-field">
              <label htmlFor="new-message-body">Message</label>
              <textarea
                id="new-message-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write your message..."
                maxLength={MAX_LENGTH}
                style={{ minHeight: '130px' }}
                autoFocus
              />
              <p className="field-help" style={{ textAlign: 'right' }}>
                {body.length}/{MAX_LENGTH}
              </p>
            </div>
            <Alert type="error" message={sendError} />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSending || !body.trim()}>
                <Icon name="send" size={15} /> {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default NewMessageModal;
