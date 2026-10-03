// Enquiries report - messages from the Contact Us page
const parts = require('../reportParts');

const { num, percent, kpi, table, bars, section, rows } = parts;

const TOPICS = ['ADMISSIONS', 'CLASSES', 'FEES', 'TECHNICAL', 'OTHER'];

async function build(params, { period }) {
  const messages = await rows(
    `SELECT m.created_at, m.full_name, m.email, m.phone, m.topic, m.status, m.handled_at, u.full_name AS handled_by,
            TIMESTAMPDIFF(MINUTE, m.created_at, m.handled_at) / 60 AS hours
     FROM contact_messages m LEFT JOIN users u ON u.id = m.handled_by
     WHERE m.created_at >= ? AND m.created_at < ?
     ORDER BY m.created_at ASC`,
    [period.start, period.end]
  );
  const waitingAll = await rows(`SELECT COUNT(*) AS total FROM contact_messages WHERE status = 'NEW'`);

  const handled = messages.filter((item) => item.status === 'HANDLED');
  const waiting = messages.filter((item) => item.status !== 'HANDLED');
  const timed = handled.filter((item) => item.hours !== null);
  const averageHours = timed.length ? timed.reduce((sum, item) => sum + num(item.hours), 0) / timed.length : null;
  const topicRows = TOPICS.map((topic) => {
    const list = messages.filter((item) => item.topic === topic);
    return {
      topic: parts.label(topic),
      received: list.length,
      handled: list.filter((item) => item.status === 'HANDLED').length,
      waiting: list.filter((item) => item.status !== 'HANDLED').length,
    };
  });

  const highlights = [`${messages.length} enquiry message(s) arrived and ${handled.length} were answered.`];
  const top = [...topicRows].sort((a, b) => b.received - a.received)[0];
  if (top && top.received > 0) highlights.push(`Most enquiries were about ${top.topic.toLowerCase()} (${top.received}).`);
  if (averageHours !== null) highlights.push(`Messages were answered in ${parts.formatHours(averageHours)} on average.`);
  if (num(waitingAll[0]?.total) > 0) highlights.push(`${num(waitingAll[0].total)} message(s) are still waiting for a reply.`);

  return {
    title: 'Enquiries Report',
    subtitle: 'Messages sent from the Contact Us page',
    orientation: 'landscape',
    summary: [
      kpi('Received', messages.length),
      kpi('Answered', handled.length, 'number', { tone: 'success' }),
      kpi('Waiting', waiting.length, 'number', { tone: waiting.length > 0 ? 'warning' : 'success' }),
      kpi('Answered (of received)', percent(handled.length, messages.length), 'percent'),
      kpi('Average reply time', averageHours, 'hours'),
    ],
    highlights,
    sections: [
      section('Enquiries by topic', [
        table(
          [
            { key: 'topic', label: 'Topic' },
            { key: 'received', label: 'Received', format: 'number' },
            { key: 'handled', label: 'Answered', format: 'number' },
            { key: 'waiting', label: 'Waiting', format: 'number' },
          ],
          topicRows,
          { totals: ['received', 'handled', 'waiting'] }
        ),
        bars('Messages by topic', topicRows.map((item) => ({ label: item.topic, value: item.received })), 'number', { emptyText: 'No enquiries in this period.' }),
      ]),
      section('Message log', [
        table(
          [
            { key: 'created_at', label: 'Received', format: 'datetime', width: 'auto' },
            { key: 'full_name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'topic', label: 'Topic', format: 'label', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'handled_at', label: 'Answered', format: 'datetime', width: 'auto' },
            { key: 'handled_by', label: 'By', width: 'auto' },
          ],
          messages,
          { emptyText: 'No enquiries were received in this period.' }
        ),
      ]),
    ],
  };
}

module.exports = { code: 'ENQ', build };
