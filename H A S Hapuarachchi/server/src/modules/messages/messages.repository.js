// Messages - database queries for chats, their messages and who has read what
const { pool } = require('../../../../../shared/server/src/config/db');

// the newest message I have seen - for an admin, another admin's office reply counts as seen (? = the viewer)
const READ_UP_TO = `IF(c.member_id = ?, COALESCE(r.last_read_id, 0),
  IF(c.kind = 'OFFICE', GREATEST(COALESCE(r.last_read_id, 0), COALESCE(c.last_other_message_id, 0)),
     COALESCE(r.last_read_id, 0)))`;

// the newest message from the other side of the chat (? = the viewer)
const LAST_FROM_OTHER_SIDE = `IF(c.member_id = ?, COALESCE(c.last_other_message_id, 0), COALESCE(c.last_member_message_id, 0))`;

// the chats a person can see: their own, a tutor's student chats, every office chat for an admin
function visibleClause(user) {
  if (user.role === 'ADMIN') return { sql: `c.kind = 'OFFICE'`, params: [] };
  if (user.role === 'TUTOR') {
    return { sql: `(c.member_id = ? OR (c.kind = 'TUTOR' AND c.tutor_id = ?))`, params: [user.id, user.id] };
  }
  return { sql: 'c.member_id = ?', params: [user.id] };
}

// both people's details, used by the chat list and the chat page
const PEOPLE_COLUMNS = `
  c.id, c.kind, c.member_id, c.tutor_id, c.last_message_id, c.last_message_at, c.created_at,
  m.full_name AS member_name, m.role AS member_role, m.status AS member_status,
  m.student_code AS member_code, m.grade AS member_grade, m.profile_picture_path AS member_picture,
  t.full_name AS tutor_name, t.status AS tutor_status, t.profile_picture_path AS tutor_picture`;

// my chats, newest first - with the last message and how many of its messages I have not read
async function listConversations(user, limit = 100) {
  const visible = visibleClause(user);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const [rows] = await pool.query(
    `SELECT ${PEOPLE_COLUMNS},
            lm.body AS last_body, lm.sender_id AS last_sender_id, lm.created_at AS last_created_at,
            ls.full_name AS last_sender_name,
            (SELECT COUNT(*) FROM conversation_messages x
             WHERE x.conversation_id = c.id AND x.from_member = IF(c.member_id = ?, 0, 1)
               AND x.id > ${READ_UP_TO}) AS unread_count
     FROM conversations c
     JOIN users m ON m.id = c.member_id
     LEFT JOIN users t ON t.id = c.tutor_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
     JOIN conversation_messages lm ON lm.id = c.last_message_id
     LEFT JOIN users ls ON ls.id = lm.sender_id
     WHERE ${visible.sql} AND c.last_message_id > COALESCE(r.cleared_up_to_id, 0)
     ORDER BY c.last_message_id DESC
     LIMIT ${safeLimit}`,
    [user.id, user.id, user.id, ...visible.params]
  );
  return rows;
}

// every chat I can see, just the ids, the last message and whether it is unread (for the bulk buttons)
async function listConversationStates(user) {
  const visible = visibleClause(user);
  const [rows] = await pool.query(
    `SELECT c.id, c.last_message_id, (${LAST_FROM_OTHER_SIDE} > ${READ_UP_TO}) AS is_unread
     FROM conversations c
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
     WHERE ${visible.sql} AND c.last_message_id > COALESCE(r.cleared_up_to_id, 0)`,
    [user.id, user.id, user.id, ...visible.params]
  );
  return rows;
}

// how many of my chats have something I have not read (the Messages badge)
async function countUnreadConversations(user) {
  const visible = visibleClause(user);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM conversations c
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
     WHERE ${visible.sql}
       AND c.last_message_id > COALESCE(r.cleared_up_to_id, 0)
       AND ${LAST_FROM_OTHER_SIDE} > ${READ_UP_TO}`,
    [user.id, ...visible.params, user.id, user.id]
  );
  return Number(rows[0].total);
}

// one chat with both people and my read / delete point
async function findConversation(conversationId, viewerId) {
  const [rows] = await pool.query(
    `SELECT ${PEOPLE_COLUMNS},
            COALESCE(r.last_read_id, 0) AS last_read_id, COALESCE(r.cleared_up_to_id, 0) AS cleared_up_to_id
     FROM conversations c
     JOIN users m ON m.id = c.member_id
     LEFT JOIN users t ON t.id = c.tutor_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
     WHERE c.id = ?
     LIMIT 1`,
    [viewerId, conversationId]
  );
  return rows[0] || null;
}

// the chat for this pair - made the first time, the same one after that
async function findOrCreateConversation({ kind, memberId, tutorId, startedBy }) {
  const pairKey = kind === 'OFFICE' ? `office:${memberId}` : `tutor:${memberId}:${tutorId}`;
  const [result] = await pool.execute(
    `INSERT INTO conversations (kind, member_id, tutor_id, pair_key, started_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [kind, memberId, tutorId || null, pairKey, startedBy]
  );
  return result.insertId;
}

// save one message and move the chat's "last message" markers forward
async function addMessage({ conversationId, senderId, fromMember, body }) {
  const [result] = await pool.execute(
    `INSERT INTO conversation_messages (conversation_id, sender_id, from_member, body, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [conversationId, senderId, fromMember ? 1 : 0, body]
  );
  const messageId = result.insertId;
  const sideColumn = fromMember ? 'last_member_message_id' : 'last_other_message_id';
  await pool.execute(
    `UPDATE conversations
     SET last_message_id = GREATEST(COALESCE(last_message_id, 0), ?),
         ${sideColumn} = GREATEST(COALESCE(${sideColumn}, 0), ?),
         last_message_at = NOW()
     WHERE id = ?`,
    [messageId, messageId, conversationId]
  );
  return messageId;
}

// the messages of a chat after my delete point - the latest 200, or only the new ones when polling
async function listMessages(conversationId, { afterId = 0, clearedUpToId = 0 } = {}) {
  const fromId = Math.max(Number(afterId) || 0, Number(clearedUpToId) || 0);
  const columns = `m.id, m.sender_id, m.from_member, m.body, m.created_at,
                   u.full_name AS sender_name, u.role AS sender_role`;
  if (Number(afterId) > 0) {
    const [rows] = await pool.query(
      `SELECT ${columns}
       FROM conversation_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.id > ?
       ORDER BY m.id ASC
       LIMIT 200`,
      [conversationId, fromId]
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT ${columns}
       FROM conversation_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.id > ?
       ORDER BY m.id DESC
       LIMIT 200
     ) recent
     ORDER BY id ASC`,
    [conversationId, fromId]
  );
  return rows;
}

// how far each chat is read, and up to where it is deleted - both only ever move forward
async function saveReadStates(userId, states) {
  if (states.length === 0) return;
  const values = states.map(() => '(?, ?, ?, ?, NOW())').join(', ');
  const params = [];
  states.forEach((state) => {
    params.push(state.conversationId, userId, state.lastReadId || 0, state.clearedUpToId || 0);
  });
  await pool.query(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_id, cleared_up_to_id, updated_at)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id)),
                             cleared_up_to_id = GREATEST(cleared_up_to_id, VALUES(cleared_up_to_id)),
                             updated_at = NOW()`,
    params
  );
}

// a person's name, role and status
async function findUserBasics(userId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, role, status, student_code, grade, profile_picture_path FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// does this tutor teach this student in an active class right now?
async function isTutorOfStudent(tutorId, studentId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE c.tutor_id = ? AND e.student_id = ? AND e.status = 'ACTIVE' AND c.status = 'ACTIVE'
     LIMIT 1`,
    [tutorId, studentId]
  );
  return rows.length > 0;
}

// the tutors who teach this student now (with their subjects)
async function listTutorsOfStudent(studentId, search) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.full_name, t.role, t.profile_picture_path,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR ', ') AS subjects
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id AND c.status = 'ACTIVE'
     JOIN users t ON t.id = c.tutor_id AND t.status = 'ACTIVE'
     WHERE e.student_id = ? AND e.status = 'ACTIVE' AND t.full_name LIKE ?
     GROUP BY t.id, t.full_name, t.role, t.profile_picture_path
     ORDER BY t.full_name ASC
     LIMIT 50`,
    [studentId, `%${search}%`]
  );
  return rows;
}

// the students in this tutor's classes now (with the classes they share)
async function listStudentsOfTutor(tutorId, search) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.role, u.student_code, u.grade, u.profile_picture_path,
            GROUP_CONCAT(DISTINCT c.subject ORDER BY c.subject SEPARATOR ', ') AS subjects
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id AND c.tutor_id = ? AND c.status = 'ACTIVE'
     JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE'
     WHERE e.status = 'ACTIVE' AND (u.full_name LIKE ? OR u.student_code LIKE ?)
     GROUP BY u.id, u.full_name, u.role, u.student_code, u.grade, u.profile_picture_path
     ORDER BY u.full_name ASC
     LIMIT 100`,
    [tutorId, `%${search}%`, `%${search}%`]
  );
  return rows;
}

// students and tutors the office can message - by name, email or student code
async function searchMembers(search) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, role, student_code, grade, email, profile_picture_path
     FROM users
     WHERE role IN ('STUDENT_PARENT', 'TUTOR') AND status = 'ACTIVE'
       AND (full_name LIKE ? OR email LIKE ? OR student_code LIKE ?)
     ORDER BY role DESC, full_name ASC
     LIMIT 40`,
    [`%${search}%`, `%${search}%`, `%${search}%`]
  );
  return rows;
}

// an unread "new message" notification this person already has for this chat
async function findUnreadMessageNotification(recipientId, link) {
  const [rows] = await pool.execute(
    `SELECT id FROM notification_log
     WHERE recipient_id = ? AND type = 'NEW_MESSAGE' AND link = ? AND read_at IS NULL AND dismissed_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [recipientId, link]
  );
  return rows[0] || null;
}

// show the newest message in that notification instead of adding another one
async function refreshMessageNotification(notificationId, message) {
  await pool.execute(`UPDATE notification_log SET message = ?, sent_at = NOW() WHERE id = ?`, [
    String(message).slice(0, 500),
    notificationId,
  ]);
}

// these people's "new message" notifications for a chat are read now (link = one chat, null = every chat)
async function markMessageNotificationsRead(recipientIds, link) {
  if (recipientIds.length === 0) return;
  const linkClause = link ? 'AND link = ?' : '';
  await pool.query(
    `UPDATE notification_log SET read_at = NOW()
     WHERE recipient_id IN (?) AND type = 'NEW_MESSAGE' AND read_at IS NULL ${linkClause}`,
    link ? [recipientIds, link] : [recipientIds]
  );
}

module.exports = {
  listConversations,
  listConversationStates,
  countUnreadConversations,
  findConversation,
  findOrCreateConversation,
  addMessage,
  listMessages,
  saveReadStates,
  findUserBasics,
  isTutorOfStudent,
  listTutorsOfStudent,
  listStudentsOfTutor,
  searchMembers,
  findUnreadMessageNotification,
  refreshMessageNotification,
  markMessageNotificationsRead,
};
