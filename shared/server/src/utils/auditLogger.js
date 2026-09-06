// Writes to the audit_log table
const { pool } = require('../config/db');

async function recordAuditEvent({ actorId, action, entityType, entityId, details }) {
  try {
    await pool.execute(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        actorId || null,
        action,
        entityType,
        entityId || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[audit-log] failed to record event:', action, error.message);
  }
}

module.exports = { recordAuditEvent };
