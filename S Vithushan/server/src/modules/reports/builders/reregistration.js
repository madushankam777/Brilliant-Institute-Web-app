// Re-registration report - who has confirmed their place for the next year
const { GRADES } = require('../../../../../../shared/server/src/config/grades');
const parts = require('../reportParts');

const { kpi, table, bars, section, rows, percent } = parts;

// best key status wins when a student has more than one key
const RANK = { USED: 4, UNUSED: 3, EXPIRED: 2, REVOKED: 1 };

async function build(params) {
  const year = params.academicYear || new Date().getFullYear() + 1;
  const finalGrade = GRADES[GRADES.length - 1];

  const students = await rows(
    `SELECT id, full_name, student_code, grade, phone, reregistered_for_year
     FROM users WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE'
     ORDER BY grade, full_name`
  );
  const keys = await rows(
    `SELECT k.student_id, k.key_code, k.from_grade, k.to_grade, k.status, k.created_at, k.used_at, k.expires_at,
            u.full_name, u.student_code, (k.status = 'UNUSED' AND k.expires_at IS NOT NULL AND k.expires_at < NOW()) AS is_expired
     FROM student_reregistration_keys k JOIN users u ON u.id = k.student_id
     WHERE k.academic_year = ?
     ORDER BY k.created_at ASC`,
    [year]
  );
  const history = await rows(
    `SELECT academic_year, promoted_count, graduated_count, removed_count, ran_at
     FROM yearly_rollover_log ORDER BY academic_year DESC LIMIT 10`
  );

  const keyStatus = new Map();
  keys.forEach((key) => {
    const status = Number(key.is_expired) ? 'EXPIRED' : key.status;
    const current = keyStatus.get(key.student_id);
    if (!current || RANK[status] > RANK[current]) keyStatus.set(key.student_id, status);
  });

  const eligible = students.filter((item) => item.grade !== finalGrade);
  const done = eligible.filter((item) => item.reregistered_for_year === year || keyStatus.get(item.id) === 'USED');
  const notDone = eligible
    .filter((item) => !done.includes(item))
    .map((item) => ({ ...item, keyState: keyStatus.has(item.id) ? keyLabel(keyStatus.get(item.id)) : 'No key issued' }));
  const awaiting = notDone.filter((item) => keyStatus.get(item.id) === 'UNUSED').length;
  const noKey = notDone.filter((item) => !keyStatus.has(item.id)).length;
  const finishing = students.filter((item) => item.grade === finalGrade).length;
  const rate = percent(done.length, eligible.length);

  const gradeRows = GRADES.filter((grade) => grade !== finalGrade).map((grade) => {
    const inGrade = eligible.filter((item) => item.grade === grade);
    const confirmed = done.filter((item) => item.grade === grade).length;
    return { grade, students: inGrade.length, confirmed, waiting: inGrade.length - confirmed, rate: percent(confirmed, inGrade.length) };
  }).filter((item) => item.students > 0);

  const highlights = [
    `${done.length} of ${eligible.length} returning students (${rate ?? 0}%) have confirmed their place for ${year}.`,
  ];
  if (awaiting > 0) highlights.push(`${awaiting} student(s) have a key but have not used it yet.`);
  if (noKey > 0) highlights.push(`${noKey} student(s) have not been given a key yet.`);
  if (finishing > 0) highlights.push(`${finishing} ${finalGrade} student(s) finish this year and do not need to re-register.`);
  if (notDone.length > 0) highlights.push(`Students who do not re-register are closed out at the January roll-over.`);

  return {
    title: 'Re-registration Report',
    subtitle: `Places confirmed for the ${year} academic year`,
    orientation: 'portrait',
    periodLabel: `Academic year ${year}`,
    filters: [{ label: 'Academic year', value: String(year) }],
    summary: [
      kpi('Returning students', eligible.length),
      kpi('Keys issued', new Set(keys.map((item) => item.student_id)).size),
      kpi('Re-registered', done.length, 'number', { tone: 'success' }),
      kpi('Key not used yet', awaiting, 'number', { tone: awaiting > 0 ? 'warning' : 'success' }),
      kpi('No key yet', noKey, 'number', { tone: noKey > 0 ? 'warning' : 'success' }),
      kpi('Re-registered (of returning)', rate, 'percent'),
    ],
    highlights,
    sections: [
      section('Progress by grade', [
        table(
          [
            { key: 'grade', label: 'Current grade' },
            { key: 'students', label: 'Students', format: 'number' },
            { key: 'confirmed', label: 'Re-registered', format: 'number' },
            { key: 'waiting', label: 'Not yet', format: 'number' },
            { key: 'rate', label: 'Done', format: 'percent' },
          ],
          gradeRows,
          { totals: ['students', 'confirmed', 'waiting'], emptyText: 'No returning students.' }
        ),
        bars('Re-registered in each grade', gradeRows.map((item) => ({ label: item.grade, value: item.rate || 0 })), 'percent', { max: 100 }),
      ]),
      section('Students not re-registered yet', [
        table(
          [
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'grade', label: 'Grade', width: 'auto' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'keyState', label: 'Key' },
          ],
          notDone,
          { emptyText: 'Every returning student has re-registered.' }
        ),
      ], { intro: 'These students will be closed out at the January roll-over unless they re-register.' }),
      section('Keys issued', [
        table(
          [
            { key: 'created_at', label: 'Issued', format: 'date', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'move', label: 'Moving', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'used_at', label: 'Used on', format: 'date', width: 'auto' },
            { key: 'expires_at', label: 'Expires', format: 'date', width: 'auto' },
          ],
          keys.map((item) => ({ ...item, move: `${item.from_grade || '-'} to ${item.to_grade}`, status: Number(item.is_expired) ? 'EXPIRED' : item.status })),
          { emptyText: `No keys have been issued for ${year} yet.` }
        ),
      ]),
      section('Roll-over history', [
        table(
          [
            { key: 'academic_year', label: 'Year', width: 'auto' },
            { key: 'promoted_count', label: 'Moved up', format: 'number' },
            { key: 'graduated_count', label: 'Finished', format: 'number' },
            { key: 'removed_count', label: 'Closed', format: 'number' },
            { key: 'ran_at', label: 'Ran on', format: 'datetime', width: 'auto' },
          ],
          history,
          { emptyText: 'The yearly roll-over has not run yet.' }
        ),
      ]),
    ],
  };
}

function keyLabel(status) {
  if (status === 'UNUSED') return 'Key issued, not used yet';
  if (status === 'EXPIRED') return 'Key expired';
  if (status === 'REVOKED') return 'Key cancelled';
  return parts.label(status);
}

module.exports = { code: 'REG', build };
