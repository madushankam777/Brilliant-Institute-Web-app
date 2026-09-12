const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const service = require('./feedback.service');

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

const getMyTickets = asyncHandler(async (req, res) => {
  const tickets = await service.getMyTickets(req.user);
  res.status(200).json({ success: true, data: { tickets } });
});

const getAllTickets = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const tickets = await service.getAllTickets(req.user, { status });
  res.status(200).json({ success: true, data: { tickets } });
});

const getTicketDetails = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.getTicketDetails(req.user, ticketId);
  res.status(200).json({ success: true, data: { ticket } });
});

const replyToTicket = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.replyToTicket(req.user, ticketId, req.body.message);
  res.status(200).json({ success: true, message: 'Reply sent.', data: { ticket } });
});

const resolveTicket = asyncHandler(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await service.resolveTicket(req.user, ticketId);
  res.status(200).json({ success: true, message: 'Ticket marked as resolved.', data: { ticket } });
});

const getTicketStatusCounts = asyncHandler(async (req, res) => {
  const counts = await service.getTicketStatusCounts();
  res.status(200).json({ success: true, data: { counts } });
});

module.exports = {
  submitFeedback,
  getMyTickets,
  getAllTickets,
  getTicketDetails,
  replyToTicket,
  resolveTicket,
  getTicketStatusCounts,
};
