// Contact Us messages: anyone can send one, Admin reads and marks them handled.
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { hasTable, migrationRequired } = require('../../../../../shared/server/src/utils/schemaFeatures');
const { notifyMany, findActiveAdminIds } = require('../../../../../shared/server/src/utils/notifications');
const repository = require('./contact.repository');

// stop with a set-up message if the contact_messages table is missing
async function requireTable() {
  if (!(await hasTable('contact_messages'))) throw migrationRequired();
}

// one message as the website shows it
function toSafeMessage(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    topic: row.topic,
    message: row.message,
    status: row.status,
    handledByName: row.handled_by_name || null,
    handledAt: row.handled_at,
    createdAt: row.created_at,
  };
}

// save a message from the Contact Us form, then tell the admins (bell and email)
async function sendMessage(data) {
  await requireTable();
  const id = await repository.createMessage(data);

  const text = String(data.message || '').replace(/\s+/g, ' ').trim();
  const preview = text.length > 200 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}...` : text;
  const message =
    `New ${String(data.topic || 'other').toLowerCase()} enquiry from ${data.fullName} (${data.email}` +
    `${data.phone ? `, ${data.phone}` : ''}): ${preview}`;
  await notifyMany(await findActiveAdminIds(), {
    type: 'ENQUIRY_NEW',
    message,
    link: `/admin/enquiries?highlight=${id}`,
  }).catch(() => {});

  return { id };
}

// admin inbox - the messages and how many are still new
async function listMessages(status) {
  await requireTable();
  const [rows, newCount] = await Promise.all([repository.listMessages(status), repository.countNewMessages()]);
  return { messages: rows.map(toSafeMessage), newCount };
}

// handled btn - mark a message handled or reopen it, and log it
async function setMessageStatus(admin, messageId, status) {
  await requireTable();
  const existing = await repository.findMessage(messageId);
  if (!existing) {
    throw ApiError.notFound('Message not found.');
  }
  await repository.setStatus(messageId, status, admin.id);
  await recordAuditEvent({
    actorId: admin.id,
    action: status === 'HANDLED' ? 'CONTACT_MESSAGE_HANDLED' : 'CONTACT_MESSAGE_REOPENED',
    entityType: 'contact_message',
    entityId: messageId,
  });
}

module.exports = { sendMessage, listMessages, setMessageStatus };
