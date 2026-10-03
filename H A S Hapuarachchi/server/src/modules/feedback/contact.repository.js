// SQL for messages sent from the public Contact Us page.
const { pool } = require('../../../../../shared/server/src/config/db');

// save a Contact Us message as NEW
async function createMessage({ fullName, email, phone, topic, message }) {
  const [result] = await pool.execute(
    `INSERT INTO contact_messages (full_name, email, phone, topic, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'NEW', NOW())`,
    [fullName, email, phone || null, topic, message]
  );
  return result.insertId;
}

// the Contact Us inbox, newest first, optionally NEW or HANDLED only (latest 200)
async function listMessages(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE m.status = ?';
    params.push(status);
  }
  const [rows] = await pool.execute(
    `SELECT m.*, u.full_name AS handled_by_name
     FROM contact_messages m
     LEFT JOIN users u ON u.id = m.handled_by
     ${where}
     ORDER BY m.created_at DESC
     LIMIT 200`,
    params
  );
  return rows;
}

// how many messages are still NEW
async function countNewMessages() {
  const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM contact_messages WHERE status = 'NEW'`);
  return Number(rows[0].total);
}

// one message by id
async function findMessage(messageId) {
  const [rows] = await pool.execute(`SELECT * FROM contact_messages WHERE id = ? LIMIT 1`, [messageId]);
  return rows[0] || null;
}

// mark a message HANDLED (with who and when) or open it again
async function setStatus(messageId, status, adminId) {
  await pool.execute(
    `UPDATE contact_messages
     SET status = ?, handled_by = ?, handled_at = IF(? = 'HANDLED', NOW(), NULL)
     WHERE id = ?`,
    [status, status === 'HANDLED' ? adminId : null, status, messageId]
  );
}

module.exports = { createMessage, listMessages, countNewMessages, findMessage, setStatus };
