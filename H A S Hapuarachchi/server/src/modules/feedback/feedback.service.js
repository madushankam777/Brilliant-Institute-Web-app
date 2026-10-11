// Feedback & Complaint business logic (FBC-01..FBC-04)
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafeFeedback } = require('../../../../../shared/server/src/utils/sanitize');
const { createNotification, findActiveAdminIds } = require('../../../../../shared/server/src/utils/notifications');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const { STATUSES, STUDENT_CATEGORIES, TUTOR_CATEGORIES } = require('./feedback.constants');
const repository = require('./feedback.repository');

// tutors and admins are staff
function isStaff(user) {
  return user.role === ROLES.TUTOR || user.role === ROLES.ADMIN;
}

// the sender and the staff a ticket is addressed to - each with the page that opens this ticket
async function ticketPeople(ticket) {
  const senderLink =
    ticket.submitted_by_role === ROLES.TUTOR ? `/admin/feedback?box=sent&ticket=${ticket.id}` : `/feedback?ticket=${ticket.id}`;
  const staffLink = `/admin/feedback?ticket=${ticket.id}`;
  const people = [{ id: ticket.submitted_by, link: senderLink }];
  if (ticket.recipient_type === 'ADMIN' || ticket.recipient_type === 'ADMIN_TUTOR') {
    for (const adminId of await findActiveAdminIds()) people.push({ id: adminId, link: staffLink });
  }
  if (ticket.recipient_tutor_id) people.push({ id: ticket.recipient_tutor_id, link: staffLink });
  return people;
}

// stop with a short message until the database update has been run
async function requireReadState() {
  if (!(await schema.hasFeedbackReads())) throw schema.migrationRequired();
}

// how many messages a ticket has - the first message counts as one
function messageCount(ticket) {
  return 1 + ticket.responses.length;
}

// a ticket as I see it - how many messages I have not read, and whether I deleted it (until something new comes)
function withReadState(user, ticket, state) {
  const authors = [ticket.submittedBy, ...ticket.responses.map((response) => response.authorId)];
  const seen = state ? Number(state.seen_count) : 0;
  const hidden = state ? Number(state.hidden_count) : 0;
  return {
    ...ticket,
    unreadCount: authors.slice(seen).filter((authorId) => authorId !== user.id).length,
    isHidden: hidden >= authors.length,
  };
}

// my ticket list with read state, minus the tickets I deleted
async function applyReadState(user, tickets) {
  if (!(await schema.hasFeedbackReads())) return tickets.map((ticket) => ({ ...ticket, unreadCount: 0 }));
  const states = await repository.listReadStates(
    user.id,
    tickets.map((ticket) => ticket.id)
  );
  return tickets
    .map((ticket) => withReadState(user, ticket, states.get(ticket.id)))
    .filter((ticket) => !ticket.isHidden)
    .map(({ isHidden, ...ticket }) => ticket);
}

// bell + email for everyone on a ticket except the person who acted
async function notifyTicketPeople(ticket, actorId, { type, message }) {
  const told = new Set([actorId]);
  for (const person of await ticketPeople(ticket)) {
    if (told.has(person.id)) continue;
    told.add(person.id);
    await createNotification({ recipientId: person.id, type, message, link: person.link, sentBy: actorId }).catch(() => {});
  }
}

// a long message cut down for a notification
function excerpt(text, length = 200) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length).replace(/\s+\S*$/, '')}...` : clean;
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

// a ticket can be opened by the person who sent it, or by the staff member it is addressed to
function assertCanView(user, ticket) {
  if (!ticket) {
    throw ApiError.notFound('Ticket not found.');
  }
  if (ticket.submitted_by === user.id) return;
  if (isStaff(user) && isAddressedTo(ticket, user)) return;
  throw ApiError.forbidden('You can only view tickets addressed to you.');
}

// submit btn - save a new ticket (a tutor can be chosen as the recipient)
async function submitFeedback(user, { category, recipientType, recipientTutorId, subject, message }) {
  // students and tutors each have their own categories
  const allowed = user.role === ROLES.TUTOR ? TUTOR_CATEGORIES : STUDENT_CATEGORIES;
  if (!allowed.includes(category)) {
    throw ApiError.badRequest('Please choose a valid category.', [
      { field: 'category', message: 'Please choose one of the categories in the list.' },
    ]);
  }
  // a tutor's feedback always goes to the office
  if (user.role === ROLES.TUTOR && recipientType !== 'ADMIN') {
    throw ApiError.badRequest('Tutors send feedback to the office (Admin).');
  }

  // if a tutor is the recipient, they must be an active tutor
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
  // ticket number such as FB-0001, made from the row id
  const ticketNumber = `FB-${String(ticketId).padStart(4, '0')}`;
  await repository.setTicketNumber(ticketId, ticketNumber);

  await recordAuditEvent({
    actorId: user.id,
    action: 'FEEDBACK_SUBMITTED',
    entityType: 'feedback_complaint',
    entityId: ticketId,
    details: { category, recipientType },
  });

  // tell the staff it is addressed to
  const ticket = await repository.findTicketById(ticketId);
  const senderName = (await repository.findUserFullName(user.id)) || user.email;
  await notifyTicketPeople(ticket, user.id, {
    type: 'FEEDBACK_NEW',
    message: `New ticket ${ticketNumber} (${category}) from ${senderName}: "${subject}" - ${excerpt(message)}`,
  });

  return toSafeFeedback(ticket);
}

// the tickets I submitted (with what I have not read yet)
async function getMyTickets(user) {
  const rows = await repository.listTicketsBySubmitter(user.id);
  return applyReadState(user, rows.map(toSafeFeedback));
}

// the staff inbox - an admin sees tickets for admins, a tutor sees tickets addressed to them
async function getAllTickets(staffUser, { status }) {
  const rows = await repository.listTicketsForStaff({ role: staffUser.role, userId: staffUser.id, status });
  return applyReadState(staffUser, rows.map(toSafeFeedback));
}

// open a ticket - I have read it
async function markTicketRead(user, ticketId) {
  await requireReadState();
  const ticket = await repository.findTicketById(ticketId);
  assertCanView(user, ticket);
  await repository.saveReadStates(user.id, [{ ticketId, seenCount: messageCount(toSafeFeedback(ticket)) }]);
}

// delete btn - take a ticket off my list (the record stays; a new reply brings it back)
async function hideTicket(user, ticketId) {
  await requireReadState();
  const ticket = await repository.findTicketById(ticketId);
  assertCanView(user, ticket);
  const count = messageCount(toSafeFeedback(ticket));
  await repository.saveReadStates(user.id, [{ ticketId, seenCount: count, hiddenCount: count }]);
}

// mark all read / delete read / delete all - the tickets sent to me (inbox) or by me (sent)
async function updateAllTickets(user, action, box) {
  await requireReadState();
  const rows =
    box === 'inbox' && isStaff(user)
      ? await repository.listTicketsForStaff({ role: user.role, userId: user.id })
      : await repository.listTicketsBySubmitter(user.id);
  const tickets = await applyReadState(user, rows.map(toSafeFeedback));
  const chosen = action === 'clear-read' ? tickets.filter((ticket) => ticket.unreadCount === 0) : tickets;
  await repository.saveReadStates(
    user.id,
    chosen.map((ticket) => ({
      ticketId: ticket.id,
      seenCount: messageCount(ticket),
      hiddenCount: action === 'read-all' ? 0 : messageCount(ticket),
    }))
  );
  return { changed: chosen.length };
}

// the Feedback menu badge - tickets with something I have not read
async function countUnreadTickets(user) {
  if (!(await schema.hasFeedbackReads())) return 0;
  const lists = [repository.listTicketsBySubmitter(user.id)];
  if (isStaff(user)) lists.push(repository.listTicketsForStaff({ role: user.role, userId: user.id }));
  const rows = (await Promise.all(lists)).flat();
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  const tickets = await applyReadState(user, unique.map(toSafeFeedback));
  return tickets.filter((ticket) => ticket.unreadCount > 0).length;
}

// one ticket - only its sender or its recipient may open it
async function getTicketDetails(user, ticketId) {
  const ticket = await repository.findTicketById(ticketId);
  assertCanView(user, ticket);
  return toSafeFeedback(ticket);
}

// send reply btn - add a reply to the ticket's thread
async function replyToTicket(user, ticketId, message) {
  const ticket = await repository.findTicketById(ticketId);
  if (!ticket) {
    throw ApiError.notFound('Ticket not found.');
  }
  // only the sender or the recipient may reply
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

  // staff reply moves ticket from PENDING to IN_PROGRESS; the sender writing on a resolved ticket opens it again
  const reopened = isOwner && ticket.status === STATUSES.RESOLVED;
  let nextStatus = ticket.status;
  if (reopened) nextStatus = STATUSES.IN_PROGRESS;
  else if (!isOwner && ticket.status === STATUSES.PENDING) nextStatus = STATUSES.IN_PROGRESS;
  await repository.appendResponse(ticketId, responseEntry, nextStatus);

  await recordAuditEvent({
    actorId: user.id,
    action: 'FEEDBACK_REPLIED',
    entityType: 'feedback_complaint',
    entityId: ticketId,
  });

  // the other side of the conversation hears about the reply
  await notifyTicketPeople(ticket, user.id, {
    type: 'FEEDBACK_REPLY',
    message:
      `${authorName} replied to ${ticket.ticket_number} "${ticket.subject}"${reopened ? ' (ticket reopened)' : ''}: ` +
      excerpt(message),
  });

  // I wrote the newest message, so I have read everything up to it
  const updated = toSafeFeedback(await repository.findTicketById(ticketId));
  if (await schema.hasFeedbackReads()) {
    await repository.saveReadStates(user.id, [{ ticketId, seenCount: messageCount(updated) }]);
  }
  return updated;
}

// resolve btn - only the staff member the ticket is addressed to can resolve it
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

  // tell the person who sent it
  if (ticket.submitted_by !== staffUser.id) {
    await createNotification({
      recipientId: ticket.submitted_by,
      type: 'FEEDBACK_RESOLVED',
      message:
        `Your ticket ${ticket.ticket_number} "${ticket.subject}" was marked as resolved. ` +
        'If the problem is still there, you can open a new ticket.',
      link:
        ticket.submitted_by_role === ROLES.TUTOR
          ? `/admin/feedback?box=sent&ticket=${ticket.id}`
          : `/feedback?ticket=${ticket.id}`,
      sentBy: staffUser.id,
    }).catch(() => {});
  }

  const updated = await repository.findTicketById(ticketId);
  return toSafeFeedback(updated);
}

// how many tickets are in each state
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
  markTicketRead,
  hideTicket,
  updateAllTickets,
  countUnreadTickets,
};
