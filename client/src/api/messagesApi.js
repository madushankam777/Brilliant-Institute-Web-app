// Messages API calls - chats with the office, tutors and students
import httpClient from '../../../shared/client/src/api/httpClient';

// tells the Messages badge to check again (after reading or sending)
export function announceMessagesChanged() {
  window.dispatchEvent(new Event('brilliant:messages-changed'));
}

// my chats, newest first (background = a poll, no loading bar)
export async function fetchConversations({ background = false } = {}) {
  const response = await httpClient.get('/messages/conversations', { background });
  return response.data.data.conversations;
}

// the number on the Messages menu item
export async function fetchUnreadMessageCount() {
  const response = await httpClient.get('/messages/unread-count', { background: true });
  return response.data.data.unread;
}

// new message btn - who I can message
export async function fetchContacts(search = '') {
  const response = await httpClient.get('/messages/contacts', { params: search ? { search } : {} });
  return response.data.data.contacts;
}

// send btn on a new chat - returns the chat id
export async function startConversation({ to, body }) {
  const response = await httpClient.post('/messages/conversations', { to, body });
  return response.data.data.conversationId;
}

// one chat and its messages (after = only the newer ones)
export async function fetchConversation(conversationId, { after = 0, background = false } = {}) {
  const response = await httpClient.get(`/messages/conversations/${conversationId}`, {
    params: after ? { after } : {},
    background,
  });
  return response.data.data;
}

// send btn - a reply
export async function sendMessage(conversationId, body) {
  const response = await httpClient.post(`/messages/conversations/${conversationId}/messages`, { body });
  return response.data.data.messageId;
}

// the chat is open - I have read it
export async function markConversationRead(conversationId) {
  await httpClient.post(`/messages/conversations/${conversationId}/read`, undefined, { background: true });
}

// delete chat btn - for me only
export async function deleteConversation(conversationId) {
  await httpClient.delete(`/messages/conversations/${conversationId}`);
}

// mark all read / delete read chats / delete all chats
export async function updateAllChats(action) {
  const response = await httpClient.post(`/messages/${action}`);
  return response.data.data;
}
