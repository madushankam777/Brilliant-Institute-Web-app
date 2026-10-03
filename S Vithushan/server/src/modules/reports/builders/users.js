// User accounts report - who has an account, new sign-ups and account security
const parts = require('../reportParts');

const { num, kpi, table, columnChart, section, rows } = parts;

// the account roles
const ROLES = ['STUDENT_PARENT', 'TUTOR', 'ADMIN'];
// the account statuses
const STATUSES = ['ACTIVE', 'SUSPENDED', 'LEFT', 'DELETED'];

// user accounts report - accounts by role and status, new sign-ups, locked accounts and tutor keys
async function build(params, { period }) {
  // accounts per role and status
  const counts = await rows(`SELECT role, status, COUNT(*) AS total FROM users GROUP BY role, status`);
  // one row per role with a count for each status
  const matrix = ROLES.map((role) => {
    const row = { role: parts.label(role) };
    let total = 0;
    STATUSES.forEach((status) => {
      const found = counts.find((item) => item.role === role && item.status === status);
      row[status] = num(found?.total);
      total += row[status];
    });
    row.total = total;
    return row;
  });
  // the row for one role
  const countOf = (role) => matrix.find((item) => item.role === parts.label(role));

  // the account directory, filtered by role and status when they are chosen
  const where = ["status <> 'DELETED'"];
  const values = [];
  if (params.role) {
    where.push('role = ?');
    values.push(params.role);
  }
  if (params.status) {
    where[0] = 'status = ?';
    values.unshift(params.status);
  }
  const directory = await rows(
    `SELECT full_name, role, student_code, email, phone, grade, status, created_at, last_login_at
     FROM users WHERE ${where.join(' AND ')}
     ORDER BY role, full_name`,
    values
  );
  // accounts created in the period
  const newUsers = await rows(
    `SELECT created_at, full_name, role, email, grade
     FROM users WHERE created_at >= ? AND created_at < ?
     ORDER BY created_at ASC`,
    [period.start, period.end]
  );
  // accounts with failed logins or a lock
  const security = await rows(
    `SELECT full_name, role, email, failed_login_attempts, locked_until, last_login_at
     FROM users
     WHERE status <> 'DELETED' AND (failed_login_attempts > 0 OR locked_until > NOW())
     ORDER BY failed_login_attempts DESC`
  );
  // active accounts that never logged in
  const neverLoggedIn = await rows(
    `SELECT COUNT(*) AS total FROM users WHERE status = 'ACTIVE' AND last_login_at IS NULL`
  );
  // tutor keys made in the period
  const keys = await rows(
    `SELECT k.created_at, k.key_code, k.intended_for, k.status, k.used_at, u.full_name AS used_by
     FROM tutor_enrollment_keys k LEFT JOIN users u ON u.id = k.used_by
     WHERE k.created_at >= ? AND k.created_at < ?
     ORDER BY k.created_at ASC`,
    [period.start, period.end]
  );

  // sign-ups by month
  const monthly = parts.monthKeys(period.from, period.to).map((key) => ({
    label: parts.monthLabel(key),
    value: newUsers.filter((item) => item.created_at.slice(0, 7) === key).length,
  }));

  // accounts in use (not deleted)
  const accounts = matrix.reduce((sum, item) => sum + item.total - item.DELETED, 0);
  const suspended = matrix.reduce((sum, item) => sum + item.SUSPENDED, 0);
  const locked = security.filter((item) => item.locked_until).length;

  // the key findings
  const highlights = [
    `${accounts} accounts in use: ${countOf('STUDENT_PARENT').total - countOf('STUDENT_PARENT').DELETED} students, ` +
      `${countOf('TUTOR').total - countOf('TUTOR').DELETED} tutors and ${countOf('ADMIN').total - countOf('ADMIN').DELETED} admins.`,
    `${newUsers.length} new account(s) were created during the period.`,
  ];
  if (suspended > 0) highlights.push(`${suspended} account(s) are suspended.`);
  if (locked > 0) highlights.push(`${locked} account(s) are locked after too many wrong passwords.`);
  if (num(neverLoggedIn[0]?.total) > 0) highlights.push(`${num(neverLoggedIn[0].total)} active account(s) have never logged in.`);

  const filterText = [params.role ? parts.label(params.role) : 'All roles', params.status ? parts.label(params.status) : 'All except deleted'].join(', ');

  // the report - title, filters, key figures, key findings and sections
  return {
    title: 'User Accounts Report',
    subtitle: 'Accounts by role and status, new registrations and account security',
    orientation: 'landscape',
    filters: [{ label: 'Directory shows', value: filterText }],
    summary: [
      kpi('Accounts in use', accounts),
      kpi('Students', countOf('STUDENT_PARENT').ACTIVE, 'number', { note: 'active' }),
      kpi('Tutors', countOf('TUTOR').ACTIVE, 'number', { note: 'active' }),
      kpi('Admins', countOf('ADMIN').ACTIVE, 'number', { note: 'active' }),
      kpi('New this period', newUsers.length, 'number', { tone: 'success' }),
      kpi('Suspended', suspended, 'number', { tone: suspended > 0 ? 'warning' : 'success' }),
    ],
    highlights,
    sections: [
      section('Accounts by role and status', [
        table(
          [
            { key: 'role', label: 'Role' },
            { key: 'ACTIVE', label: 'Active', format: 'number' },
            { key: 'SUSPENDED', label: 'Suspended', format: 'number' },
            { key: 'LEFT', label: 'Left', format: 'number' },
            { key: 'DELETED', label: 'Deleted', format: 'number' },
            { key: 'total', label: 'Total', format: 'number' },
          ],
          matrix,
          { totals: ['ACTIVE', 'SUSPENDED', 'LEFT', 'DELETED', 'total'] }
        ),
      ]),
      section('New registrations', [
        monthly.length > 1 ? columnChart('New accounts each month', monthly, 'number') : null,
        table(
          [
            { key: 'created_at', label: 'Joined', format: 'datetime', width: 'auto' },
            { key: 'full_name', label: 'Name' },
            { key: 'role', label: 'Role', format: 'label', width: 'auto' },
            { key: 'grade', label: 'Grade', width: 'auto' },
            { key: 'email', label: 'Email' },
          ],
          newUsers,
          { emptyText: 'No new accounts in this period.' }
        ),
      ]),
      section('Account security', [
        table(
          [
            { key: 'full_name', label: 'Name' },
            { key: 'role', label: 'Role', format: 'label', width: 'auto' },
            { key: 'email', label: 'Email' },
            { key: 'failed_login_attempts', label: 'Wrong passwords', format: 'number' },
            { key: 'locked_until', label: 'Locked until', format: 'datetime', width: 'auto' },
            { key: 'last_login_at', label: 'Last login', format: 'datetime', width: 'auto' },
          ],
          security,
          { emptyText: 'No failed logins or locked accounts right now.' }
        ),
        table(
          [
            { key: 'created_at', label: 'Issued', format: 'date', width: 'auto' },
            { key: 'key_code', label: 'Key', width: 'auto' },
            { key: 'intended_for', label: 'Issued for' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'used_by', label: 'Used by' },
            { key: 'used_at', label: 'Used on', format: 'date', width: 'auto' },
          ],
          keys.map((item) => ({ ...item, key_code: maskKey(item.key_code, item.status) })),
          { title: 'Tutor enrolment keys issued in this period', emptyText: 'No tutor keys were issued in this period.' }
        ),
      ], { intro: 'Unused tutor keys are partly hidden because they still work.' }),
      section('Account directory', [
        table(
          [
            { key: 'full_name', label: 'Name' },
            { key: 'role', label: 'Role', format: 'label', width: 'auto' },
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'created_at', label: 'Joined', format: 'date', width: 'auto' },
            { key: 'last_login_at', label: 'Last login', format: 'date', width: 'auto' },
          ],
          directory,
          { emptyText: 'No accounts match these filters.' }
        ),
      ], { pageBreak: directory.length > 15 }),
    ],
  };
}

// an unused key still works, so only its first block is shown
function maskKey(code, status) {
  if (status !== 'UNUSED' || !code) return code;
  return `${code.split('-')[0]}-${code.split('-')[1] || ''}-••••-••••`;
}

module.exports = { code: 'USR', build };
