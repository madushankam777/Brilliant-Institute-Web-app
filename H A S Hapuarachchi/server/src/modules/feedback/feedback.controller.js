// feedback controller - reads the request, calls the feedback service and sends the JSON reply
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./feedback.service');

// POST /api/feedback - send a new ticket
const submitFeedback = asyncHandler(async (req, res) => {
  const { category, recipientType, recipientTutorId, subject, message } = req.body;
  const ticket = await service.submitFeedback(req.user, {
    category,
    recipientType,
    recipientTutorId,
    subject,
    message,
  });
  res.status(201).json({
    success: true,
    message: `Your ticket ${ticket.ticketNumber} has been submitted. We'll get back to you shortly.`,
    data: { ticket },
  });
});

// GET /my - the tickets I submitted
const getMyTickets = asyncHandler(async (req, res) => {
  const tickets = await service.getMyTickets(req.user);
  res.status(200).json({ success: true, data: { tickets } });
});

// GET /all - the staff inbox (optionally by status)
const getAllTickets = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const tickets = await service.getAllTickets(req.user, { status });
  res.status(200).json({ success: true, data: { tickets } });
});

// GET /:ticketId - one ticket
const getTicketDetails = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.getTicketDetails(req.user, ticketId);
  res.status(200).json({ success: true, data: { ticket } });
});

// POST /:ticketId/reply - add a reply
const replyToTicket = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.replyToTicket(req.user, ticketId, req.body.message);
  res.status(200).json({ success: true, message: 'Reply sent.', data: { ticket } });
});

// PATCH /:ticketId/resolve - mark a ticket resolved
const resolveTicket = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.resolveTicket(req.user, ticketId);
  res.status(200).json({ success: true, message: 'Ticket marked as resolved.', data: { ticket } });
});

// GET /status-counts - ticket totals by status
const getTicketStatusCounts = asyncHandler(async (req, res) => {
  const counts = await service.getTicketStatusCounts();
  res.status(200).json({ success: true, data: { counts } });
});

// POST /:ticketId/read - I have read this ticket
const markTicketRead = asyncHandler(async (req, res) => {
  await service.markTicketRead(req.user, Number(req.params.ticketId));
  res.status(200).json({ success: true });
});

// DELETE /:ticketId - take a ticket off my list (only for me)
const hideTicket = asyncHandler(async (req, res) => {
  await service.hideTicket(req.user, Number(req.params.ticketId));
  res.status(200).json({ success: true, message: 'Removed from your list.' });
});

// POST /read-all, /clear-read, /clear-all - the buttons above a ticket list
const updateAllTickets = (action) =>
  asyncHandler(async (req, res) => {
    const result = await service.updateAllTickets(req.user, action, req.body.box);
    res.status(200).json({ success: true, data: result });
  });

// GET /unread-count - the number on the Feedback menu item
const unreadCount = asyncHandler(async (req, res) => {
  const unread = await service.countUnreadTickets(req.user);
  res.status(200).json({ success: true, data: { unread } });
});

module.exports = {
  submitFeedback,
  getMyTickets,
  getAllTickets,
  getTicketDetails,
  replyToTicket,
  resolveTicket,
  getTicketStatusCounts,
  markTicketRead,
  hideTicket,
  unreadCount,
  markAllRead: updateAllTickets('read-all'),
  clearRead: updateAllTickets('clear-read'),
  clearAll: updateAllTickets('clear-all'),
};
