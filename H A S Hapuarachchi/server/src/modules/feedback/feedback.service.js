// Feedback & Complaint business logic (FBC-01..FBC-04)
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafeFeedback } = require('../../../../../shared/server/src/utils/sanitize');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const { STATUSES } = require('./feedback.constants');
const repository = require('./feedback.repository');

function isStaff(user) {
  return user.role === ROLES.TUTOR || user.role === ROLES.ADMIN;
}

// check if ticket is addressed to this staff member
function isAddressedTo(ticket, user) {
  if (user.role === ROLES.ADMIN) {
    return ticket.recipient_type === 'ADMIN' || ticket.recipient_type === 'ADMIN_TUTOR';
  }
  if (user.role === ROLES.TUTOR) {
    return (
      (ticket.recipient_type === 'TUTOR' || ticket.recipient_type === 'ADMIN_TUTOR') &&
      ticket.recipient_tutor_id === user.id
    );
  }
  return false;
}

function assertCanView(user, ticket) {
  if (!ticket) {
    throw ApiError.notFound('Ticket not found.');
  }
  if (ticket.submitted_by === user.id) return;
  if (isStaff(user) && isAddressedTo(ticket, user)) return;
  throw ApiError.forbidden('You can only view tickets addressed to you.');
}

async function submitFeedback(user, { category, recipientType, recipientTutorId, subject, message }) {
  let normalizedTutorId = null;
  if (recipientType === 'TUTOR' || recipientType === 'ADMIN_TUTOR') {
    if (!recipientTutorId) {
      throw ApiError.badRequest('Please select which Tutor this message is for.');
    }
    const tutor = await repository.findActiveTutorById(recipientTutorId);
    if (!tutor) {
      throw ApiError.badRequest('Please select a valid, active Tutor.');
    }
    normalizedTutorId = tutor.id;
  }

  const ticketId = await repository.createTicket({
    ticketNumber: 'PENDING',
    submittedBy: user.id,
    category,
    recipientType,
    recipientTutorId: normalizedTutorId,
    subject,
    message,
  });
  const ticketNumber = `FB-${String(ticketId).padStart(4, '0')}`;
  await repository.setTicketNumber(ticketId, ticketNumber);

  await recordAuditEvent({
    actorId: user.id,
    action: 'FEEDBACK_SUBMITTED',
    entityType: 'feedback_complaint',
    entityId: ticketId,
    details: { category, recipientType },
  });

  const ticket = await repository.findTicketById(ticketId);
  return toSafeFeedback(ticket);
}

async function getMyTickets(user) {
  const rows = await repository.listTicketsBySubmitter(user.id);
  return rows.map(toSafeFeedback);
}

async function getAllTickets(staffUser, { status }) {
  const rows = await repository.listTicketsForStaff({ role: staffUser.role, userId: staffUser.id, status });
  return rows.map(toSafeFeedback);
}

async function getTicketDetails(user, ticketId) {
  const ticket = await repository.findTicketById(ticketId);
  assertCanView(user, ticket);
  return toSafeFeedback(ticket);
}

// reply to ticket btn
async function replyToTicket(user, ticketId, message) {
  const ticket = await repository.findTicketById(ticketId);
  if (!ticket) {
    throw ApiError.notFound('Ticket not found.');
  }
  const isOwner = ticket.submitted_by === user.id;
  if (!isOwner && !isAddressedTo(ticket, user)) {
    throw ApiError.forbidden('This ticket is not addressed to you.');
  }

  // look up real name for the reply thread
  const authorName = (await repository.findUserFullName(user.id)) || user.email;
  const responseEntry = {
    authorId: user.id,
    authorName,
    authorRole: user.role,
    message,
    createdAt: new Date().toISOString(),
  };

  // staff reply moves ticket from PENDING to IN_PROGRESS
  const nextStatus = !isOwner && ticket.status === STATUSES.PENDING ? STATUSES.IN_PROGRESS : ticket.status;
  await repository.appendResponse(ticketId, responseEntry, nextStatus);

  await recordAuditEvent({
    actorId: user.id,
    action: 'FEEDBACK_REPLIED',
    entityType: 'feedback_complaint',
    entityId: ticketId,
  });

  const updated = await repository.findTicketById(ticketId);
  return toSafeFeedback(updated);
}

async function resolveTicket(staffUser, ticketId) {
  const ticket = await repository.findTicketById(ticketId);
  if (!ticket) {
    throw ApiError.notFound('Ticket not found.');
  }
  if (!isAddressedTo(ticket, staffUser)) {
    throw ApiError.forbidden('This ticket is not addressed to you.');
  }
  if (ticket.status === STATUSES.RESOLVED) {
    throw ApiError.badRequest('This ticket is already resolved.');
  }

  await repository.markResolved(ticketId, staffUser.id);
  await recordAuditEvent({
    actorId: staffUser.id,
    action: 'FEEDBACK_RESOLVED',
    entityType: 'feedback_complaint',
    entityId: ticketId,
  });

  const updated = await repository.findTicketById(ticketId);
  return toSafeFeedback(updated);
}

async function getTicketStatusCounts() {
  const rows = await repository.countTicketsByStatus();
  const counts = { PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  rows.forEach((row) => {
    counts[row.status] = Number(row.total);
  });
  return counts;
}

module.exports = {
  submitFeedback,
  getMyTickets,
  getAllTickets,
  getTicketDetails,
  replyToTicket,
  resolveTicket,
  getTicketStatusCounts,
};
