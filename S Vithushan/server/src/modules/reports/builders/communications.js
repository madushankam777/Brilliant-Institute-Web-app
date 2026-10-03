// Announcements & notifications report - what the institute told its students and tutors
const parts = require('../reportParts');

const { num, kpi, table, bars, section, rows } = parts;

async function build(params, { period }) {
  const announcements = await rows(
    `SELECT a.created_at, a.title, a.target_audience, a.target_grade, a.priority, a.status, a.scheduled_at, a.version,
            u.full_name AS published_by
     FROM announcements a JOIN users u ON u.id = a.published_by
     WHERE a.created_at >= ? AND a.created_at < ?
     ORDER BY a.created_at ASC`,
    [period.start, period.end]
  );
  const upcoming = await rows(
    `SELECT a.scheduled_at, a.title, a.target_audience, a.target_grade, a.priority
     FROM announcements a WHERE a.status = 'SCHEDULED' AND a.scheduled_at >= NOW()
     ORDER BY a.scheduled_at ASC`
  );
  const byType = await rows(
    `SELECT type, COUNT(*) AS total FROM notification_log
     WHERE sent_at >= ? AND sent_at < ? GROUP BY type ORDER BY total DESC`,
    [period.start, period.end]
  );
  const byChannel = await rows(
    `SELECT channel, COUNT(*) AS total, COUNT(DISTINCT recipient_id) AS people FROM notification_log
     WHERE sent_at >= ? AND sent_at < ? GROUP BY channel ORDER BY total DESC`,
    [period.start, period.end]
  );

  const sent = byType.reduce((sum, item) => sum + num(item.total), 0);
  const high = announcements.filter((item) => item.priority === 'HIGH').length;
  const published = announcements.filter((item) => item.status === 'PUBLISHED').length;

  const highlights = [`${announcements.length} announcement(s) were created, ${published} of them published.`];
  if (high > 0) highlights.push(`${high} announcement(s) were marked high priority.`);
  highlights.push(`${sent} notification(s) were sent to students and tutors.`);
  if (byType.length > 0) highlights.push(`The most common notification was "${parts.label(byType[0].type).toLowerCase()}" (${num(byType[0].total)}).`);
  if (upcoming.length > 0) highlights.push(`${upcoming.length} announcement(s) are scheduled to go out later.`);

  return {
    title: 'Announcements & Notifications Report',
    subtitle: 'Announcements published and notifications sent',
    orientation: 'portrait',
    summary: [
      kpi('Announcements', announcements.length),
      kpi('Published', published, 'number', { tone: 'success' }),
      kpi('High priority', high, 'number', { tone: high > 0 ? 'warning' : 'default' }),
      kpi('Scheduled', upcoming.length),
      kpi('Notifications sent', sent),
    ],
    highlights,
    sections: [
      section('Announcements', [
        table(
          [
            { key: 'created_at', label: 'Created', format: 'date', width: 'auto' },
            { key: 'title', label: 'Title' },
            { key: 'audience', label: 'Audience', width: 'auto' },
            { key: 'priority', label: 'Priority', format: 'status', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'published_by', label: 'By', width: 'auto' },
          ],
          announcements.map((item) => ({ ...item, audience: audienceText(item) })),
          { emptyText: 'No announcements in this period.' }
        ),
        upcoming.length > 0
          ? table(
            [
              { key: 'scheduled_at', label: 'Goes out', format: 'datetime', width: 'auto' },
              { key: 'title', label: 'Title' },
              { key: 'audience', label: 'Audience', width: 'auto' },
              { key: 'priority', label: 'Priority', format: 'status', width: 'auto' },
            ],
            upcoming.map((item) => ({ ...item, audience: audienceText(item) })),
            { title: 'Scheduled for later' }
          )
          : null,
      ]),
      section('Notifications', [
        bars('Notifications by type', byType.map((item) => ({ label: parts.label(item.type), value: num(item.total) })), 'number', { emptyText: 'No notifications were sent in this period.' }),
        table(
          [
            { key: 'channel', label: 'Channel', format: 'label' },
            { key: 'total', label: 'Sent', format: 'number' },
            { key: 'people', label: 'People reached', format: 'number' },
          ],
          byChannel,
          { title: 'By channel', totals: ['total'], emptyText: 'No notifications were sent in this period.' }
        ),
      ]),
    ],
  };
}

function audienceText(item) {
  const who = item.target_audience === 'STUDENT_PARENT' ? 'Students' : item.target_audience === 'TUTOR' ? 'Tutors' : 'Everyone';
  return item.target_grade ? `${who} - ${item.target_grade}` : who;
}

module.exports = { code: 'COM', build };
