// Feedback & complaints report - tickets received, solved and still open
const parts = require('../reportParts');

const { num, percent, kpi, table, bars, section, rows, one } = parts;

const CATEGORIES = [
  'Class Scheduling Issue',
  'Class Quality & Tutor Feedback',
  'Billing / Payment Inquiry',
  'Technical Issue',
  'Other',
];

async function build(params, { period }) {
  const tickets = await rows(
    `SELECT f.ticket_number, f.created_at, f.category, f.subject, f.priority, f.status, f.resolved_at, f.recipient_type,
            u.full_name AS submitted_by, t.full_name AS tutor_name
     FROM feedback_complaints f
     JOIN users u ON u.id = f.submitted_by
     LEFT JOIN users t ON t.id = f.recipient_tutor_id
     WHERE f.created_at >= ? AND f.created_at < ?
     ORDER BY f.created_at ASC`,
    [period.start, period.end]
  );
  const open = await rows(
    `SELECT f.ticket_number, f.created_at, f.category, f.subject, f.priority, f.status, u.full_name AS submitted_by,
            DATEDIFF(NOW(), f.created_at) AS age_days
     FROM feedback_complaints f JOIN users u ON u.id = f.submitted_by
     WHERE f.status <> 'RESOLVED'
     ORDER BY FIELD(f.priority, 'HIGH', 'MEDIUM', 'LOW'), f.created_at ASC`
  );
  const resolved = await one(
    `SELECT COUNT(*) AS total, AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) / 60 AS hours
     FROM feedback_complaints WHERE resolved_at >= ? AND resolved_at < ?`,
    [period.start, period.end]
  );

  // standard categories plus any others found in the tickets
  const names = [...new Set([...CATEGORIES, ...tickets.map((item) => item.category)])];
  const categoryRows = names.map((category) => {
    const list = tickets.filter((item) => item.category === category);
    return {
      category,
      received: list.length,
      resolved: list.filter((item) => item.status === 'RESOLVED').length,
      open: list.filter((item) => item.status !== 'RESOLVED').length,
      high: list.filter((item) => item.priority === 'HIGH').length,
    };
  });

  const resolvedInPeriod = tickets.filter((item) => item.status === 'RESOLVED').length;
  const highOpen = open.filter((item) => item.priority === 'HIGH').length;
  const resolutionRate = percent(resolvedInPeriod, tickets.length);
  const hours = resolved.hours === null ? null : num(resolved.hours);

  const highlights = [`${tickets.length} ticket(s) were received and ${num(resolved.total)} were resolved during the period.`];
  const busiest = [...categoryRows].sort((a, b) => b.received - a.received)[0];
  if (busiest && busiest.received > 0) highlights.push(`Most tickets were about "${busiest.category}" (${busiest.received}).`);
  if (hours !== null) highlights.push(`Tickets took ${parts.formatHours(hours)} on average to resolve.`);
  if (open.length > 0) highlights.push(`${open.length} ticket(s) are still open${highOpen > 0 ? `, ${highOpen} of them high priority` : ''}.`);
  const oldest = open.reduce((max, item) => Math.max(max, num(item.age_days)), 0);
  if (oldest > 7) highlights.push(`The oldest open ticket has been waiting ${oldest} days.`);

  return {
    title: 'Feedback & Complaints Report',
    subtitle: 'Tickets from students and parents, how fast they were solved and what is still open',
    orientation: 'landscape',
    summary: [
      kpi('Received', tickets.length),
      kpi('Resolved', num(resolved.total), 'number', { tone: 'success' }),
      kpi('Open now', open.length, 'number', { tone: open.length > 0 ? 'warning' : 'success' }),
      kpi('High priority open', highOpen, 'number', { tone: highOpen > 0 ? 'danger' : 'success' }),
      kpi('Average time to resolve', hours, 'hours'),
      kpi('Resolved (of received)', resolutionRate, 'percent'),
    ],
    highlights,
    sections: [
      section('Tickets by category', [
        table(
          [
            { key: 'category', label: 'Category' },
            { key: 'received', label: 'Received', format: 'number' },
            { key: 'resolved', label: 'Resolved', format: 'number' },
            { key: 'open', label: 'Still open', format: 'number' },
            { key: 'high', label: 'High priority', format: 'number' },
          ],
          categoryRows,
          { totals: ['received', 'resolved', 'open', 'high'] }
        ),
        bars('Tickets received by category', categoryRows.map((item) => ({ label: item.category, value: item.received })), 'number', { emptyText: 'No tickets in this period.' }),
      ]),
      section('Open tickets', [
        table(
          [
            { key: 'ticket_number', label: 'Ticket', width: 'auto' },
            { key: 'created_at', label: 'Opened', format: 'date', width: 'auto' },
            { key: 'submitted_by', label: 'From' },
            { key: 'category', label: 'Category' },
            { key: 'subject', label: 'Subject' },
            { key: 'priority', label: 'Priority', format: 'status', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'age', label: 'Waiting', align: 'right', width: 'auto' },
          ],
          open.map((item) => ({ ...item, age: `${num(item.age_days)} day(s)` })),
          { emptyText: 'Every ticket has been resolved.' }
        ),
      ], { intro: 'All tickets that are not resolved yet, high priority first.' }),
      section('Tickets received in this period', [
        table(
          [
            { key: 'ticket_number', label: 'Ticket', width: 'auto' },
            { key: 'created_at', label: 'Received', format: 'date', width: 'auto' },
            { key: 'submitted_by', label: 'From' },
            { key: 'sentTo', label: 'Sent to', width: 'auto' },
            { key: 'category', label: 'Category' },
            { key: 'subject', label: 'Subject' },
            { key: 'priority', label: 'Priority', format: 'status', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'resolved_at', label: 'Resolved', format: 'date', width: 'auto' },
          ],
          tickets.map((item) => ({ ...item, sentTo: item.tutor_name ? `${parts.label(item.recipient_type)} - ${item.tutor_name}` : parts.label(item.recipient_type) })),
          { emptyText: 'No tickets were received in this period.' }
        ),
      ]),
    ],
  };
}

module.exports = { code: 'FBK', build };
