// Audit trail report - who did what and when
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const parts = require('../reportParts');
const { actionName } = require('../reportActivity');

const { kpi, table, bars, section, rows, one } = parts;

// changes worth a second look
const SENSITIVE = [
  'USER_SUSPENDED', 'USER_ACTIVATED', 'USER_DELETED', 'USER_CREATED_BY_ADMIN', 'PASSWORD_RESET_COMPLETED',
  'PASSWORD_RESET_LINK_ISSUED', 'PAYMENT_SETTINGS_UPDATED', 'PAYMENT_RECORDED_BY_ADMIN', 'BANK_TRANSFER_APPROVED',
  'BANK_TRANSFER_REJECTED', 'TUTOR_PAID', 'PAYOUT_SETTLED', 'PAYOUT_FAILED', 'TUTOR_BANK_DETAILS_VIEWED',
  'TUTOR_BANK_DETAILS_UPDATED', 'TUTOR_BANK_DETAILS_UPDATED_BY_ADMIN', 'TUTOR_KEY_GENERATED', 'TUTOR_KEY_REVOKED',
  'TUTOR_KEY_DELETED', 'CLASS_CANCELLED', 'YEARLY_ROLLOVER_RUN', 'ATTENDANCE_CORRECTED',
];

async function build(params, { period }) {
  // one person only, when chosen
  let person = null;
  if (params.userId) {
    person = await one('SELECT id, full_name, role FROM users WHERE id = ?', [params.userId]);
    if (!person.id) throw ApiError.notFound('That person was not found.');
  }
  const events = await rows(
    `SELECT a.created_at, a.action, a.entity_type, a.entity_id, u.full_name, u.role
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.created_at >= ? AND a.created_at < ? ${person ? 'AND a.actor_id = ?' : ''}
     ORDER BY a.created_at ASC, a.id ASC`,
    person ? [period.start, period.end, person.id] : [period.start, period.end]
  );
  const byAction = new Map();
  events.forEach((item) => byAction.set(item.action, (byAction.get(item.action) || 0) + 1));
  const actionRows = [...byAction.entries()].map(([action, total]) => ({ action: actionName(action), total })).sort((a, b) => b.total - a.total);

  const people = new Set(events.filter((item) => item.full_name).map((item) => item.full_name)).size;
  const logins = byAction.get('LOGIN_SUCCESS') || 0;
  const failedLogins = byAction.get('LOGIN_FAILED') || 0;
  const resets = (byAction.get('PASSWORD_RESET_REQUESTED') || 0) + (byAction.get('PASSWORD_RESET_COMPLETED') || 0);
  const adminActions = events.filter((item) => item.role === 'ADMIN').length;
  const sensitive = events.filter((item) => SENSITIVE.includes(item.action));

  const toRow = (item) => ({
    created_at: item.created_at,
    who: item.full_name || 'System',
    role: item.role ? parts.label(item.role) : '-',
    action: actionName(item.action),
    item: item.entity_id ? `${parts.label(item.entity_type)} #${item.entity_id}` : parts.label(item.entity_type),
  });

  const highlights = [`${events.length} recorded action(s) by ${people} people during the period.`];
  if (failedLogins > 0) highlights.push(`${failedLogins} wrong-password attempt(s) were recorded against ${logins} successful login(s).`);
  if (sensitive.length > 0) highlights.push(`${sensitive.length} sensitive change(s) - account, payment and payout actions - are listed for review.`);
  if (actionRows.length > 0) highlights.push(`Most frequent action: ${actionRows[0].action.toLowerCase()} (${actionRows[0].total}).`);

  return {
    title: 'Audit Trail Report',
    subtitle: person ? `Everything ${person.full_name} did on the site` : 'Recorded actions across the system',
    filters: [{ label: 'Person', value: person ? `${person.full_name} (${parts.label(person.role)})` : 'Everyone' }],
    orientation: 'landscape',
    summary: [
      kpi('Actions recorded', events.length),
      kpi('People', people),
      kpi('Logins', logins, 'number', { tone: 'success' }),
      kpi('Wrong passwords', failedLogins, 'number', { tone: failedLogins > 0 ? 'warning' : 'success' }),
      kpi('Password resets', resets),
      kpi('Admin actions', adminActions),
    ],
    highlights,
    sections: [
      section('Actions by type', [
        bars('Most frequent actions', actionRows.slice(0, 15).map((item) => ({ label: item.action, value: item.total })), 'number', { emptyText: 'Nothing was recorded in this period.' }),
      ]),
      section('Sensitive changes', [
        table(
          [
            { key: 'created_at', label: 'When', format: 'datetime', width: 'auto' },
            { key: 'who', label: 'By' },
            { key: 'role', label: 'Role', width: 'auto' },
            { key: 'action', label: 'Action' },
            { key: 'item', label: 'Item', width: 'auto' },
          ],
          sensitive.map(toRow),
          { emptyText: 'No sensitive changes in this period.' }
        ),
      ], { intro: 'Account, payment, payout and settings changes.' }),
      section('Full activity log', [
        table(
          [
            { key: 'created_at', label: 'When', format: 'datetime', width: 'auto' },
            { key: 'who', label: 'By' },
            { key: 'role', label: 'Role', width: 'auto' },
            { key: 'action', label: 'Action' },
            { key: 'item', label: 'Item', width: 'auto' },
          ],
          events.map(toRow),
          { emptyText: 'Nothing was recorded in this period.' }
        ),
      ], { pageBreak: events.length > 25 }),
    ],
  };
}

module.exports = { code: 'AUD', build };
