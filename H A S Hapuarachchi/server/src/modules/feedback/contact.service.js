// Contact Us messages: anyone can send one, Admin reads and marks them handled.
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { hasTable, migrationRequired } = require('../../../../../shared/server/src/utils/schemaFeatures');
const repository = require('./contact.repository');

async function requireTable() {
  if (!(await hasTable('contact_messages'))) throw migrationRequired();
}

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

async function sendMessage(data) {
  await requireTable();
  const id = await repository.createMessage(data);
  return { id };
}

async function listMessages(status) {
  await requireTable();
  const [rows, newCount] = await Promise.all([repository.listMessages(status), repository.countNewMessages()]);
  return { messages: rows.map(toSafeMessage), newCount };
}

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
