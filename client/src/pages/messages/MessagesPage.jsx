// Messages page - chats with the office, tutors and students (students can never chat with other students)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  announceMessagesChanged,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  sendMessage,
  updateAllChats,
} from '../../api/messagesApi';
import { useAuth } from '../../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import ConfirmDialog from '../../../../shared/client/src/components/common/ConfirmDialog';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import NewMessageModal from './NewMessageModal';

// check for new messages - the open chat often, the chat list less often
const CHAT_POLL_MS = 8000;
const LIST_POLL_MS = 20000;
// the longest message
const MAX_LENGTH = 2000;

// who each role can message, shown under the page title
const SUBTITLES = {
  STUDENT_PARENT: 'Chat with the office and the tutors of your classes.',
  TUTOR: 'Chat with the office and the students in your classes.',
  ADMIN: 'The office inbox - chat with any student or tutor. Every admin sees these chats.',
};

// the bulk buttons and what each one asks before it runs
const BULK_ACTIONS = {
  'read-all': { label: 'Mark all read', title: 'Mark all as read', icon: 'checkCircle', confirm: null },
  'clear-read': {
    label: 'Delete read',
    title: 'Delete read chats?',
    icon: 'trash',
    confirm: 'Delete every chat you have already read? They are only removed for you, and come back if someone writes again.',
  },
  'clear-all': {
    label: 'Delete all',
    title: 'Delete all chats?',
    icon: 'trash',
    confirm: 'Delete all your chats? They are only removed for you, and come back if someone writes again.',
  },
};

// "3:45 PM" today, "Mon" this week, else "12 Oct"
function shortTime(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (now - date < 6 * 24 * 60 * 60 * 1000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// "Today", "Yesterday" or "Mon, 12 Oct" - the line between days in a chat
function dayLabel(isoDate) {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// the picture next to a chat - the office has its own icon
function PartyAvatar({ other, size = 40 }) {
  if (other.role === 'OFFICE') {
    return (
      <span className="office-avatar" style={{ width: size, height: size }} aria-hidden="true">
        <Icon name="inbox" size={Math.round(size * 0.48)} />
      </span>
    );
  }
  return <Avatar name={other.name} pictureUrl={other.pictureUrl} size={size} />;
}

// "Student", "Tutor", "Admin" - the role under a sender's name
function roleWord(role) {
  if (role === 'ADMIN') return 'Office';
  if (role === 'TUTOR') return 'Tutor';
  if (role === 'STUDENT_PARENT') return 'Student';
  return '';
}

// the messages page - my chats on the left, the open chat on the right (one at a time on a phone)
function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { conversationId: routeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = Number(routeId) || null;

  // the chat list
  const [conversations, setConversations] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState('');

  // the open chat
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // pop-ups - new message, and "are you sure?"
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  const chatBodyRef = useRef(null);
  const lastIdRef = useRef(0);
  const stickToBottomRef = useRef(true);
  // the chat open right now - a slow reply for another chat is ignored
  const openIdRef = useRef(openId);
  openIdRef.current = openId;

  // load my chats (background = a quiet check, no spinner)
  const loadList = useCallback(async (background = false) => {
    try {
      const rows = await fetchConversations({ background });
      setConversations(rows);
      setListError('');
    } catch (error) {
      if (!background) setListError(error.message);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // the open chat is read - here, in the list, in the badge and in the bell
  const markOpenChatRead = useCallback(async (conversationId) => {
    setConversations((rows) => rows.map((row) => (row.id === conversationId ? { ...row, unreadCount: 0 } : row)));
    try {
      await markConversationRead(conversationId);
      announceMessagesChanged();
    } catch {
      // not critical - it is marked read next time
    }
  }, []);

  // open a chat - its messages, then mark it read
  const loadChat = useCallback(
    async (conversationId) => {
      setIsLoadingChat(true);
      setChatError('');
      setSendError('');
      try {
        const data = await fetchConversation(conversationId);
        if (openIdRef.current !== conversationId) return;
        setChat(data.conversation);
        setMessages(data.messages);
        lastIdRef.current = data.messages.length > 0 ? data.messages[data.messages.length - 1].id : 0;
        stickToBottomRef.current = true;
        await markOpenChatRead(conversationId);
      } catch (error) {
        if (openIdRef.current !== conversationId) return;
        setChat(null);
        setMessages([]);
        setChatError(error.message);
      } finally {
        if (openIdRef.current === conversationId) setIsLoadingChat(false);
      }
    },
    [markOpenChatRead]
  );

  // newer messages in the open chat (a quiet check)
  const pollChat = useCallback(async () => {
    if (!openId || document.visibilityState === 'hidden') return;
    try {
      const data = await fetchConversation(openId, { after: lastIdRef.current, background: true });
      if (openIdRef.current !== openId) return;
      setChat(data.conversation);
      if (data.messages.length > 0) {
        setMessages((previous) => {
          const known = new Set(previous.map((message) => message.id));
          return [...previous, ...data.messages.filter((message) => !known.has(message.id))];
        });
        lastIdRef.current = data.messages[data.messages.length - 1].id;
        if (data.messages.some((message) => !message.ownSide)) await markOpenChatRead(openId);
      }
    } catch {
      // try again next time
    }
  }, [openId, markOpenChatRead]);

  // the chat list when the page opens, then every 20 seconds
  useEffect(() => {
    loadList();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') loadList(true);
    }, LIST_POLL_MS);
    const onFocus = () => loadList(true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadList]);

  // a different chat was opened
  useEffect(() => {
    setDraft('');
    if (openId) {
      loadChat(openId);
    } else {
      setChat(null);
      setMessages([]);
    }
  }, [openId, loadChat]);

  // the open chat checks for new messages every 8 seconds
  useEffect(() => {
    if (!openId) return undefined;
    const timer = setInterval(pollChat, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [openId, pollChat]);

  // ?to=ID - a "Message" button elsewhere opens a new message to that person
  useEffect(() => {
    if (searchParams.get('to')) setIsNewOpen(true);
  }, [searchParams]);

  // keep the newest message in view (unless the user scrolled up to read)
  useEffect(() => {
    const body = chatBodyRef.current;
    if (body && stickToBottomRef.current) body.scrollTop = body.scrollHeight;
  }, [messages]);

  // remember whether the user is reading the bottom of the chat
  function handleChatScroll() {
    const body = chatBodyRef.current;
    if (!body) return;
    stickToBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  }

  // send btn - send the reply, then show it
  async function handleSend(event) {
    if (event) event.preventDefault();
    const text = draft.trim();
    if (!text || !openId || isSending) return;
    setIsSending(true);
    setSendError('');
    try {
      await sendMessage(openId, text);
      setDraft('');
      stickToBottomRef.current = true;
      await pollChat();
      loadList(true);
      announceMessagesChanged();
    } catch (error) {
      setSendError(error.message);
    } finally {
      setIsSending(false);
    }
  }

  // Enter sends, Shift + Enter starts a new line
  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  }

  // a bulk button - asks first when it deletes
  function startBulk(action) {
    if (BULK_ACTIONS[action].confirm) {
      setConfirm({ action, text: BULK_ACTIONS[action].confirm, title: BULK_ACTIONS[action].title });
      return;
    }
    runAction(action);
  }

  // run a bulk button, or delete the open chat
  async function runAction(action) {
    setIsWorking(true);
    setNotice('');
    setListError('');
    try {
      if (action === 'delete-chat') {
        await deleteConversation(openId);
        setNotice('Chat deleted. It comes back if someone writes again.');
        navigate('/messages');
      } else {
        const result = await updateAllChats(action);
        if (action === 'read-all') setNotice('All chats are marked as read.');
        else setNotice(result.changed > 0 ? `${result.changed} chat${result.changed === 1 ? '' : 's'} deleted.` : 'Nothing to delete.');
        if (action !== 'read-all' && openId) navigate('/messages');
      }
      await loadList(true);
      announceMessagesChanged();
    } catch (error) {
      setListError(error.message);
    } finally {
      setIsWorking(false);
      setConfirm(null);
    }
  }

  // the new message pop-up sent its first message - open that chat
  function handleStarted(conversationId) {
    setIsNewOpen(false);
    if (searchParams.get('to')) setSearchParams({}, { replace: true });
    loadList(true);
    announceMessagesChanged();
    if (conversationId === openId) loadChat(conversationId);
    else navigate(`/messages/${conversationId}`);
  }

  // close the new message pop-up
  function closeNewMessage() {
    setIsNewOpen(false);
    if (searchParams.get('to')) setSearchParams({}, { replace: true });
  }

  const unreadChats = conversations.filter((row) => row.unreadCount > 0).length;
  const shownConversations = filter === 'UNREAD' ? conversations.filter((row) => row.unreadCount > 0) : conversations;

  // the messages, with a line where each new day starts
  const chatRows = [];
  messages.forEach((message, index) => {
    const label = dayLabel(message.sentAt);
    if (index === 0 || dayLabel(messages[index - 1].sentAt) !== label) {
      chatRows.push({ type: 'day', key: `day-${message.id}`, label });
    }
    chatRows.push({ type: 'message', key: message.id, message });
  });

  // the page
  return (
    <PortalShell navItems={getNavItems(user.role)}>
      <div className="page messages-page">
        <div className="flex-between page-header">
          <div>
            <h1>Messages</h1>
            <p className="muted">{SUBTITLES[user.role] || SUBTITLES.STUDENT_PARENT}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setIsNewOpen(true)}>
            <Icon name="plus" size={16} /> New message
          </button>
        </div>

        <Alert type="success" message={notice} />
        <Alert type="error" message={listError} />

        <div className={`messages-layout${openId ? ' has-open' : ''}`}>
          {/* my chats */}
          <section className="card conversation-pane" aria-label="Chats">
            <div className="conversation-toolbar">
              <div className="conversation-filter" role="tablist" aria-label="Show">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'ALL'}
                  className={filter === 'ALL' ? 'active' : ''}
                  onClick={() => setFilter('ALL')}
                >
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'UNREAD'}
                  className={filter === 'UNREAD' ? 'active' : ''}
                  onClick={() => setFilter('UNREAD')}
                >
                  Unread{unreadChats > 0 ? ` (${unreadChats})` : ''}
                </button>
              </div>
              <div className="conversation-bulk">
                {Object.entries(BULK_ACTIONS).map(([action, info]) => (
                  <button
                    key={action}
                    type="button"
                    className={`icon-text-btn${action === 'clear-all' ? ' is-danger' : ''}`}
                    onClick={() => startBulk(action)}
                    disabled={isWorking || conversations.length === 0 || (action === 'read-all' && unreadChats === 0)}
                    title={info.title}
                  >
                    <Icon name={info.icon} size={14} />
                    <span>{info.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="conversation-list">
              {isLoadingList ? (
                <LoadingSpinner label="Loading chats..." />
              ) : shownConversations.length === 0 ? (
                <div className="conversation-empty">
                  <Icon name="mail" size={28} />
                  <p>{filter === 'UNREAD' ? 'No unread chats - you are all caught up.' : 'No chats yet.'}</p>
                  {filter === 'ALL' && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsNewOpen(true)}>
                      Start a chat
                    </button>
                  )}
                </div>
              ) : (
                shownConversations.map((row) => {
                  const lastFrom = row.lastMessage.fromMe
                    ? 'You: '
                    : row.lastMessage.senderName && row.lastMessage.senderName !== row.other.name
                      ? `${row.lastMessage.senderName.split(' ')[0]}: `
                      : '';
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`conversation-item${row.id === openId ? ' active' : ''}${row.unreadCount > 0 ? ' is-unread' : ''}`}
                      onClick={() => navigate(`/messages/${row.id}`)}
                      aria-current={row.id === openId ? 'true' : undefined}
                    >
                      <PartyAvatar other={row.other} size={42} />
                      <span className="conversation-text">
                        <span className="conversation-top">
                          <span className="conversation-name">{row.other.name}</span>
                          <span className="conversation-time">{shortTime(row.lastMessage.sentAt)}</span>
                        </span>
                        <span className="conversation-bottom">
                          <span className="conversation-preview">
                            {lastFrom}
                            {row.lastMessage.preview}
                          </span>
                          {row.unreadCount > 0 && (
                            <span className="unread-pill" aria-label={`${row.unreadCount} unread`}>
                              {row.unreadCount > 99 ? '99+' : row.unreadCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* the open chat */}
          <section className="card chat-pane" aria-label="Chat">
            {!openId ? (
              <div className="chat-placeholder">
                <Icon name="chat" size={36} />
                <h2>Your messages</h2>
                <p className="muted">Pick a chat on the left, or start a new one.</p>
                <button type="button" className="btn btn-primary" onClick={() => setIsNewOpen(true)}>
                  <Icon name="plus" size={16} /> New message
                </button>
              </div>
            ) : isLoadingChat && !chat ? (
              <LoadingSpinner label="Opening chat..." />
            ) : chatError ? (
              <div className="chat-placeholder">
                <Alert type="error" message={chatError} />
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/messages')}>
                  Back to my chats
                </button>
              </div>
            ) : (
              chat && (
                <>
                  <div className="chat-header">
                    <button
                      type="button"
                      className="chat-back"
                      onClick={() => navigate('/messages')}
                      aria-label="Back to my chats"
                    >
                      <Icon name="chevronLeft" size={20} />
                    </button>
                    <PartyAvatar other={chat.other} size={40} />
                    <div className="chat-header-text">
                      <h2>{chat.other.name}</h2>
                      <p>{chat.other.detail}</p>
                    </div>
                    <button
                      type="button"
                      className="icon-text-btn is-danger"
                      onClick={() =>
                        setConfirm({
                          action: 'delete-chat',
                          title: 'Delete this chat?',
                          text: 'It is only removed for you. It comes back if a new message arrives.',
                        })
                      }
                      title="Delete chat"
                    >
                      <Icon name="trash" size={15} />
                      <span>Delete chat</span>
                    </button>
                  </div>

                  <div className="chat-body" ref={chatBodyRef} onScroll={handleChatScroll} aria-live="polite">
                    {chatRows.length === 0 && <p className="chat-empty muted">No messages here yet - say hello.</p>}
                    {chatRows.map((row) =>
                      row.type === 'day' ? (
                        <div key={row.key} className="chat-day">
                          <span>{row.label}</span>
                        </div>
                      ) : (
                        <div key={row.key} className={`chat-bubble-row${row.message.ownSide ? ' own' : ''}`}>
                          <div className="chat-bubble">
                            <div className="chat-bubble-meta">
                              {row.message.mine
                                ? 'You'
                                : `${row.message.senderName}${roleWord(row.message.senderRole) ? ` · ${roleWord(row.message.senderRole)}` : ''}`}
                            </div>
                            <div className="chat-bubble-text">{row.message.body}</div>
                            <span className="chat-bubble-time">
                              {new Date(row.message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {chat.canReply ? (
                    <form className="chat-composer" onSubmit={handleSend}>
                      <label htmlFor="chat-draft" className="sr-only">
                        Your message
                      </label>
                      <textarea
                        id="chat-draft"
                        placeholder="Type a message... (Enter to send, Shift + Enter for a new line)"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleDraftKeyDown}
                        maxLength={MAX_LENGTH}
                        rows={2}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSending || !draft.trim()}
                        aria-label="Send message"
                      >
                        <Icon name="send" size={16} />
                        <span className="btn-label">{isSending ? 'Sending...' : 'Send'}</span>
                      </button>
                    </form>
                  ) : (
                    <p className="chat-closed">
                      <Icon name="lock" size={14} /> {chat.closedReason}
                    </p>
                  )}
                  {sendError && (
                    <div className="chat-send-error">
                      <Alert type="error" message={sendError} />
                    </div>
                  )}
                  {draft.length > MAX_LENGTH - 200 && (
                    <p className="chat-count muted">
                      {draft.length}/{MAX_LENGTH}
                    </p>
                  )}
                </>
              )
            )}
          </section>
        </div>

        {/* new message pop-up */}
        {isNewOpen && (
          <NewMessageModal
            role={user.role}
            initialTo={searchParams.get('to')}
            initialName={searchParams.get('name')}
            onClose={closeNewMessage}
            onSent={handleStarted}
          />
        )}

        {/* are you sure? (deleting chats) */}
        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            text={confirm.text}
            isBusy={isWorking}
            onConfirm={() => runAction(confirm.action)}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </PortalShell>
  );
}

export default MessagesPage;
