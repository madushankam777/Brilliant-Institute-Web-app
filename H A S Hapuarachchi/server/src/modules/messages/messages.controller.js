// Messages controller - reads the request, calls the messages service and sends the JSON reply
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./messages.service');

// GET /api/messages/conversations - my chats
const listConversations = asyncHandler(async (req, res) => {
  const conversations = await service.listConversations(req.user);
  res.status(200).json({ success: true, data: { conversations } });
});

// GET /api/messages/unread-count - the number on the Messages menu item
const unreadCount = asyncHandler(async (req, res) => {
  const unread = await service.countUnread(req.user);
  res.status(200).json({ success: true, data: { unread } });
});

// GET /api/messages/contacts?search= - who I can start a chat with
const listContacts = asyncHandler(async (req, res) => {
  const contacts = await service.listContacts(req.user, req.query.search);
  res.status(200).json({ success: true, data: { contacts } });
});

// POST /api/messages/conversations - start (or continue) a chat with its first message
const startConversation = asyncHandler(async (req, res) => {
  const result = await service.startConversation(req.user, { to: req.body.to, body: req.body.body });
  res.status(201).json({ success: true, message: 'Message sent.', data: result });
});

// GET /api/messages/conversations/:id?after= - one chat and its messages
const getConversation = asyncHandler(async (req, res) => {
  const data = await service.getConversation(req.user, Number(req.params.conversationId), Number(req.query.after) || 0);
  res.status(200).json({ success: true, data });
});

// POST /api/messages/conversations/:id/messages - send a reply
const sendMessage = asyncHandler(async (req, res) => {
  const result = await service.sendMessage(req.user, Number(req.params.conversationId), req.body.body);
  res.status(201).json({ success: true, data: result });
});

// POST /api/messages/conversations/:id/read - I have read this chat
const markRead = asyncHandler(async (req, res) => {
  await service.markRead(req.user, Number(req.params.conversationId));
  res.status(200).json({ success: true });
});

// DELETE /api/messages/conversations/:id - delete this chat for me
const deleteConversation = asyncHandler(async (req, res) => {
  await service.deleteConversation(req.user, Number(req.params.conversationId));
  res.status(200).json({ success: true, message: 'Chat deleted.' });
});

// POST /api/messages/read-all, /clear-read, /clear-all - the buttons above the chat list
const updateAllChats = (action) =>
  asyncHandler(async (req, res) => {
    const result = await service.updateAllChats(req.user, action);
    res.status(200).json({ success: true, data: result });
  });

module.exports = {
  listConversations,
  unreadCount,
  listContacts,
  startConversation,
  getConversation,
  sendMessage,
  markRead,
  deleteConversation,
  markAllRead: updateAllChats('read-all'),
  clearRead: updateAllChats('clear-read'),
  clearAll: updateAllChats('clear-all'),
};
