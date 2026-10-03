// All the SQL for the Feedback & Complaint module lives here.
const { pool } = require('../../../../../shared/server/src/config/db');

// a ticket with who sent it and the tutor it is for - reused by the ticket lists
const TICKET_WITH_SUBMITTER_SELECT = `
  SELECT f.*, u.full_name AS submitted_by_name, u.role AS submitted_by_role,
         t.full_name AS recipient_tutor_name
  FROM feedback_complaints f
  JOIN users u ON u.id = f.submitted_by
  LEFT JOIN users t ON t.id = f.recipient_tutor_id
`;

// save a new ticket as PENDING with an empty reply list
async function createTicket({
  ticketNumber,
  submittedBy,
  category,
  recipientType,
  recipientTutorId,
  subject,
  message,
}) {
  const [result] = await pool.execute(
    `INSERT INTO feedback_complaints
       (ticket_number, submitted_by, category, recipient_type, recipient_tutor_id,
        subject, message, status, responses, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', JSON_ARRAY(), NOW())`,
    [ticketNumber, submittedBy, category, recipientType, recipientTutorId || null, subject, message]
  );
  return result.insertId;
}

// one active tutor by id
async function findActiveTutorById(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? AND role = 'TUTOR' AND status = 'ACTIVE' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

// save the ticket number such as FB-0001
async function setTicketNumber(ticketId, ticketNumber) {
  await pool.execute(`UPDATE feedback_complaints SET ticket_number = ? WHERE id = ?`, [
    ticketNumber,
    ticketId,
  ]);
}

// one ticket by id
async function findTicketById(ticketId) {
  const [rows] = await pool.execute(`${TICKET_WITH_SUBMITTER_SELECT} WHERE f.id = ? LIMIT 1`, [
    ticketId,
  ]);
  return rows[0] || null;
}

// the tickets one person sent, newest first
async function listTicketsBySubmitter(userId) {
  const [rows] = await pool.execute(
    `${TICKET_WITH_SUBMITTER_SELECT} WHERE f.submitted_by = ? ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

// staff ticket list - admin sees all, tutor sees only their own
async function listTicketsForStaff({ role, userId, status }) {
  const clauses = [];
  const params = [];

  if (role === 'ADMIN') {
    clauses.push(`f.recipient_type IN ('ADMIN', 'ADMIN_TUTOR')`);
  } else {
    clauses.push(`f.recipient_type IN ('TUTOR', 'ADMIN_TUTOR') AND f.recipient_tutor_id = ?`);
    params.push(userId);
  }

  if (status) {
    clauses.push('f.status = ?');
    params.push(status);
  }

  const [rows] = await pool.execute(
    `${TICKET_WITH_SUBMITTER_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY f.created_at DESC`,
    params
  );
  return rows;
}

// add a reply to the ticket's reply list and set its new status
async function appendResponse(ticketId, responseEntry, newStatus) {
  await pool.execute(
    `UPDATE feedback_complaints
     SET responses = JSON_ARRAY_APPEND(COALESCE(responses, JSON_ARRAY()), '$', CAST(? AS JSON)),
         status = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [JSON.stringify(responseEntry), newStatus, ticketId]
  );
}

// mark a ticket RESOLVED and note who and when
async function markResolved(ticketId, resolvedBy) {
  await pool.execute(
    `UPDATE feedback_complaints
     SET status = 'RESOLVED', resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [resolvedBy, ticketId]
  );
}

// a person's full name, shown on their reply
async function findUserFullName(userId) {
  const [rows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]);
  return rows[0] ? rows[0].full_name : null;
}

// number of tickets in each status
async function countTicketsByStatus() {
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS total FROM feedback_complaints GROUP BY status`
  );
  return rows;
}

module.exports = {
  createTicket,
  findActiveTutorById,
  setTicketNumber,
  findTicketById,
  listTicketsBySubmitter,
  listTicketsForStaff,
  appendResponse,
  markResolved,
  findUserFullName,
  countTicketsByStatus,
};
