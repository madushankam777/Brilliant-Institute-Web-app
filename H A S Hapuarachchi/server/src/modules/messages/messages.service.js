// Messages - students chat with the office and their tutors, tutors with the office and their students (never student to student)
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const notifications = require('../../../../../shared/server/src/utils/notifications');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const repository = require('./messages.repository');

const OFFICE_NAME = 'Brilliant Institute office';
const MAX_LENGTH = 2000;

// stop with a short message until the database update has been run
async function requireMessaging() {
  if (!(await schema.hasMessaging())) throw schema.migrationRequired();
}

// which side of a chat this person is on - 'member', 'office' (an admin) or 'tutor'; null = not their chat
function sideOf(user, conversation) {
  if (conversation.member_id === user.id) return 'member';
  if (conversation.kind === 'OFFICE' && user.role === ROLES.ADMIN) return 'office';
  if (conversation.kind === 'TUTOR' && conversation.tutor_id === user.id) return 'tutor';
  return null;
}

// a long message cut down for a preview
function preview(text, length) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length).replace(/\s+\S*$/, '')}...` : clean;
}

// the message as it is saved - trimmed, no long runs of empty lines
function cleanBody(body) {
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!text) throw ApiError.badRequest('Please type a message.');
  if (text.length > MAX_LENGTH) throw ApiError.badRequest(`Messages can be up to ${MAX_LENGTH} characters.`);
  return text;
}

// "Student · ST0000164 · Grade 10" or "Tutor"
function memberDetail(row) {
  if (row.member_role === ROLES.TUTOR) return 'Tutor';
  return ['Student', row.member_code, row.member_grade].filter(Boolean).join(' · ');
}

// who is on the other side of the chat, as this person sees it
function otherParty(user, row) {
  const side = sideOf(user, row);
  if (side === 'member' && row.kind === 'OFFICE') {
    return { name: OFFICE_NAME, role: 'OFFICE', detail: 'Admin team - any admin can reply', pictureUrl: null };
  }
  if (side === 'member') {
    return { name: row.tutor_name, role: ROLES.TUTOR, detail: 'Your tutor', pictureUrl: row.tutor_picture || null };
  }
  return {
    name: row.member_name,
    role: row.member_role,
    detail: memberDetail(row),
    pictureUrl: row.member_picture || null,
    userId: row.member_id,
  };
}

// why this person cannot send in this chat any more (null = they can)
async function closedReason(user, conversation) {
  const side = sideOf(user, conversation);
  if (['DELETED', 'LEFT'].includes(conversation.member_status)) {
    return 'This chat is closed because the account was closed.';
  }
  if (conversation.kind !== 'TUTOR') return null;
  const stillTeaching =
    conversation.tutor_status === 'ACTIVE' &&
    conversation.member_status === 'ACTIVE' &&
    (await repository.isTutorOfStudent(conversation.tutor_id, conversation.member_id));
  if (stillTeaching) return null;
  return side === 'member'
    ? 'This chat is closed because you are no longer in this tutor\'s classes. You can still message the office.'
    : 'This chat is closed because this student is no longer in your classes.';
}

// one chat in the list
function toSafeConversation(user, row) {
  return {
    id: row.id,
    kind: row.kind,
    other: otherParty(user, row),
    lastMessage: {
      preview: preview(row.last_body, 120),
      fromMe: row.last_sender_id === user.id,
      senderName: row.last_sender_name || null,
      sentAt: row.last_created_at,
    },
    unreadCount: Number(row.unread_count || 0),
  };
}

// one message as this person sees it (ownSide = my side of the chat, e.g. any admin's office reply)
function toSafeMessage(user, side, row) {
  const fromMember = Number(row.from_member) === 1;
  return {
    id: row.id,
    body: row.body,
    sentAt: row.created_at,
    mine: row.sender_id === user.id,
    ownSide: side === 'member' ? fromMember : !fromMember,
    senderName: row.sender_name || 'Closed account',
    senderRole: row.sender_role || null,
  };
}

// the chat, if this person may open it (404 otherwise, so other people's chats stay hidden)
async function findOwnConversation(user, conversationId) {
  const conversation = await repository.findConversation(conversationId, user.id);
  if (!conversation || !sideOf(user, conversation)) {
    throw ApiError.notFound('Chat not found.');
  }
  return conversation;
}

// tell the other side - one notification per chat until they read it (it shows the newest message)
async function notifyOtherSide(user, conversation, side, text) {
  const link = `/messages/${conversation.id}`;
  const sender = await repository.findUserBasics(user.id);
  const senderName = sender ? sender.full_name : 'Someone';

  let recipientIds;
  let label;
  if (conversation.kind === 'OFFICE' && side === 'member') {
    recipientIds = await notifications.findActiveAdminIds();
    label = `${senderName} (${user.role === ROLES.TUTOR ? 'tutor' : 'student'})`;
  } else if (conversation.kind === 'OFFICE') {
    recipientIds = [conversation.member_id];
    label = `${OFFICE_NAME} (${senderName})`;
    // an admin answered - the other admins' alerts for this chat are dealt with
    await repository.markMessageNotificationsRead(await notifications.findActiveAdminIds(), link);
  } else if (side === 'member') {
    recipientIds = [conversation.tutor_id];
    label = `${senderName} (student)`;
  } else {
    recipientIds = [conversation.member_id];
    label = `${senderName} (your tutor)`;
  }

  const message = `${label}: ${preview(text, 200)}`;
  for (const recipientId of recipientIds.filter((id) => id !== user.id)) {
    const existing = await repository.findUnreadMessageNotification(recipientId, link);
    if (existing) {
      await repository.refreshMessageNotification(existing.id, message);
    } else {
      await notifications.createNotification({
        recipientId,
        type: 'NEW_MESSAGE',
        message,
        link,
        sentBy: user.id,
        channel: 'EMAIL',
      });
    }
  }
}

// send in a chat this person belongs to - checks the rules, saves it and tells the other side
async function postMessage(user, conversationId, body) {
  const conversation = await findOwnConversation(user, conversationId);
  const side = sideOf(user, conversation);
  const reason = await closedReason(user, conversation);
  if (reason) throw ApiError.forbidden(reason);

  const text = cleanBody(body);
  const messageId = await repository.addMessage({
    conversationId,
    senderId: user.id,
    fromMember: side === 'member',
    body: text,
  });
  // my own message - I have read everything up to it
  await repository.saveReadStates(user.id, [{ conversationId, lastReadId: messageId }]);
  await notifyOtherSide(user, conversation, side, text).catch(() => {
    // the message is saved - a notification problem never loses it
  });
  return messageId;
}

// who a new chat is with - only pairs the rules allow
async function resolveTarget(user, to) {
  if (to === 'OFFICE') {
    if (user.role === ROLES.ADMIN) {
      throw ApiError.badRequest('You are the office - pick a student or tutor to message.');
    }
    return { kind: 'OFFICE', memberId: user.id, tutorId: null };
  }

  const targetId = Number(to);
  if (!Number.isInteger(targetId) || targetId < 1 || targetId === user.id) {
    throw ApiError.badRequest('Please choose who to message.');
  }
  const target = await repository.findUserBasics(targetId);
  if (!target || target.status !== 'ACTIVE') {
    throw ApiError.notFound('That person was not found.');
  }

  // the office can message any student or tutor
  if (user.role === ROLES.ADMIN) {
    if (target.role === ROLES.ADMIN) {
      throw ApiError.badRequest('Admins share the office inbox - message a student or tutor instead.');
    }
    return { kind: 'OFFICE', memberId: target.id, tutorId: null };
  }

  // a student - only their own tutors (never another student)
  if (user.role === ROLES.STUDENT_PARENT) {
    if (target.role !== ROLES.TUTOR) {
      throw ApiError.forbidden('Students can message the office and their own tutors only.');
    }
    if (!(await repository.isTutorOfStudent(target.id, user.id))) {
      throw ApiError.forbidden('You can message a tutor once you are enrolled in one of their classes.');
    }
    return { kind: 'TUTOR', memberId: user.id, tutorId: target.id };
  }

  // a tutor - only students in their classes
  if (user.role === ROLES.TUTOR) {
    if (target.role !== ROLES.STUDENT_PARENT) {
      throw ApiError.forbidden('Tutors can message the office and the students in their classes only.');
    }
    if (!(await repository.isTutorOfStudent(user.id, target.id))) {
      throw ApiError.forbidden('You can only message students who are enrolled in your classes.');
    }
    return { kind: 'TUTOR', memberId: target.id, tutorId: user.id };
  }

  throw ApiError.forbidden();
}

// my chats, newest first
async function listConversations(user) {
  await requireMessaging();
  const rows = await repository.listConversations(user, 100);
  return rows.map((row) => toSafeConversation(user, row));
}

// how many chats have something unread (0 before the database update)
async function countUnread(user) {
  if (!(await schema.hasMessaging())) return 0;
  return repository.countUnreadConversations(user);
}

// new message btn - the people this person is allowed to start a chat with
async function listContacts(user, search) {
  await requireMessaging();
  const term = String(search || '').trim().slice(0, 60);
  const office = { to: 'OFFICE', name: OFFICE_NAME, role: 'OFFICE', detail: 'Admin team', pictureUrl: null };
  const showOffice = user.role !== ROLES.ADMIN && (!term || /office|admin|brilliant/i.test(term));

  if (user.role === ROLES.ADMIN) {
    const rows = await repository.searchMembers(term);
    return rows.map((row) => ({
      to: row.id,
      name: row.full_name,
      role: row.role,
      detail: row.role === ROLES.TUTOR ? `Tutor · ${row.email}` : ['Student', row.student_code, row.grade].filter(Boolean).join(' · '),
      pictureUrl: row.profile_picture_path || null,
    }));
  }
  if (user.role === ROLES.TUTOR) {
    const rows = await repository.listStudentsOfTutor(user.id, term);
    const students = rows.map((row) => ({
      to: row.id,
      name: row.full_name,
      role: row.role,
      detail: ['Student', row.student_code, row.subjects].filter(Boolean).join(' · '),
      pictureUrl: row.profile_picture_path || null,
    }));
    return showOffice ? [office, ...students] : students;
  }
  const rows = await repository.listTutorsOfStudent(user.id, term);
  const tutors = rows.map((row) => ({
    to: row.id,
    name: row.full_name,
    role: row.role,
    detail: `Tutor · ${row.subjects}`,
    pictureUrl: row.profile_picture_path || null,
  }));
  return showOffice ? [office, ...tutors] : tutors;
}

// new message - find or start the chat with that person, then send the first message
async function startConversation(user, { to, body }) {
  await requireMessaging();
  const target = await resolveTarget(user, to);
  const conversationId = await repository.findOrCreateConversation({ ...target, startedBy: user.id });
  await postMessage(user, conversationId, body);
  return { conversationId };
}

// open a chat - its messages after my delete point (after = only newer ones, when polling)
async function getConversation(user, conversationId, after) {
  await requireMessaging();
  const conversation = await findOwnConversation(user, conversationId);
  const side = sideOf(user, conversation);
  const [rows, reason] = await Promise.all([
    repository.listMessages(conversationId, { afterId: after, clearedUpToId: conversation.cleared_up_to_id }),
    closedReason(user, conversation),
  ]);
  return {
    conversation: {
      id: conversation.id,
      kind: conversation.kind,
      other: otherParty(user, conversation),
      canReply: !reason,
      closedReason: reason,
    },
    messages: rows.map((row) => toSafeMessage(user, side, row)),
  };
}

// send btn - a reply in an open chat
async function sendMessage(user, conversationId, body) {
  await requireMessaging();
  const messageId = await postMessage(user, conversationId, body);
  return { messageId };
}

// opening a chat reads it, and its bell notification too
async function markRead(user, conversationId) {
  await requireMessaging();
  const conversation = await findOwnConversation(user, conversationId);
  if (conversation.last_message_id) {
    await repository.saveReadStates(user.id, [{ conversationId, lastReadId: conversation.last_message_id }]);
  }
  await repository.markMessageNotificationsRead([user.id], `/messages/${conversationId}`);
}

// delete chat btn - hide it for me only (a new message brings it back)
async function deleteConversation(user, conversationId) {
  await requireMessaging();
  const conversation = await findOwnConversation(user, conversationId);
  const lastId = conversation.last_message_id || 0;
  await repository.saveReadStates(user.id, [{ conversationId, lastReadId: lastId, clearedUpToId: lastId }]);
  await repository.markMessageNotificationsRead([user.id], `/messages/${conversationId}`);
}

// mark all read / delete read chats / delete all chats - only for me
async function updateAllChats(user, action) {
  await requireMessaging();
  const states = await repository.listConversationStates(user);
  const chosen = action === 'clear-read' ? states.filter((state) => Number(state.is_unread) !== 1) : states;
  await repository.saveReadStates(
    user.id,
    chosen.map((state) => ({
      conversationId: state.id,
      lastReadId: state.last_message_id,
      clearedUpToId: action === 'read-all' ? 0 : state.last_message_id,
    }))
  );
  if (action !== 'clear-read') await repository.markMessageNotificationsRead([user.id], null);
  return { changed: chosen.length };
}

// Notify Students page - the same message to many students (and/or the office), each as a chat they can answer
async function sendFromTutorToMany(tutorUser, { studentIds, includeOffice, body }) {
  await requireMessaging();
  const text = cleanBody(body);
  let sent = 0;
  for (const studentId of studentIds) {
    const conversationId = await repository.findOrCreateConversation({
      kind: 'TUTOR',
      memberId: studentId,
      tutorId: tutorUser.id,
      startedBy: tutorUser.id,
    });
    await postMessage(tutorUser, conversationId, text);
    sent += 1;
  }
  if (includeOffice) {
    const conversationId = await repository.findOrCreateConversation({
      kind: 'OFFICE',
      memberId: tutorUser.id,
      tutorId: null,
      startedBy: tutorUser.id,
    });
    await postMessage(tutorUser, conversationId, text);
  }
  return { sent };
}

module.exports = {
  listConversations,
  countUnread,
  listContacts,
  startConversation,
  getConversation,
  sendMessage,
  markRead,
  deleteConversation,
  updateAllChats,
  sendFromTutorToMany,
  MAX_LENGTH,
};
