// Tutor payouts report - what was paid to tutors, with bank references
const ApiError = require('../../../../../../shared/server/src/utils/ApiError');
const parts = require('../reportParts');
const data = require('../reportData');

const { kpi, table, bars, section, signatures, one, money } = parts;

// tutor payouts report - what was paid to tutors, with bank references, waiting and failed transfers
async function build(params, { period }) {
  // which tutor (or all tutors)
  let tutorName = 'All tutors';
  if (params.tutorId) {
    const tutor = await one(`SELECT full_name FROM users WHERE id = ? AND role = 'TUTOR'`, [params.tutorId]);
    if (!tutor.full_name) throw ApiError.notFound('Tutor not found.');
    tutorName = tutor.full_name;
  }
  // payouts in the period
  const payouts = await data.getPayouts(period, params.tutorId);
  // payouts still waiting or failed, from any date
  const unsettled = await data.getUnsettledPayouts(params.tutorId);
  // payouts that were paid
  const paid = payouts.filter(data.isPaid);
  // payouts waiting to be sent
  const queued = payouts.filter((item) => item.status === 'QUEUED');
  // transfers that failed
  const failed = payouts.filter((item) => item.status === 'FAILED');
  // total amount of a list of payouts
  const sum = (list) => list.reduce((total, item) => total + item.amount, 0);

  // one row per tutor
  const byTutor = new Map();
  payouts.forEach((item) => {
    const entry = byTutor.get(item.tutor_id) || { tutor: item.tutor_name, payouts: 0, paid: 0, waiting: 0, failed: 0, last: null };
    entry.payouts += 1;
    if (data.isPaid(item)) {
      entry.paid += item.amount;
      if (!entry.last || item.paid_at > entry.last) entry.last = item.paid_at;
    }
    if (item.status === 'QUEUED') entry.waiting += item.amount;
    if (item.status === 'FAILED') entry.failed += item.amount;
    byTutor.set(item.tutor_id, entry);
  });
  // tutors with the most paid first
  const tutorRows = [...byTutor.values()].sort((a, b) => b.paid - a.paid);

  // the key findings
  const highlights = [`LKR ${money(sum(paid))} was paid in ${paid.length} payout(s) to ${tutorRows.filter((item) => item.paid > 0).length} tutor(s).`];
  if (queued.length > 0) highlights.push(`${queued.length} payout(s) worth LKR ${money(sum(queued))} are waiting to be transferred.`);
  if (failed.length > 0) highlights.push(`${failed.length} transfer(s) worth LKR ${money(sum(failed))} failed and need to be sent again.`);
  // unsettled payouts from before this period
  const older = unsettled.filter((item) => !payouts.some((payout) => payout.id === item.id));
  if (older.length > 0) highlights.push(`${older.length} unsettled payout(s) from before this period still need attention.`);
  // bank transfers with no bank reference recorded
  const noReference = paid.filter((item) => item.method === 'BANK_TRANSFER' && !item.provider_reference);
  if (noReference.length > 0) highlights.push(`${noReference.length} bank transfer(s) have no bank reference recorded.`);

  // the report - title, filters, key figures, key findings and sections
  return {
    title: 'Tutor Payouts Report',
    subtitle: `${tutorName} - payments made to tutors`,
    orientation: 'landscape',
    filters: [{ label: 'Tutor', value: tutorName }],
    summary: [
      kpi('Paid to tutors', sum(paid), 'lkr0', { tone: 'success', note: `${paid.length} payout(s)` }),
      kpi('Tutors paid', tutorRows.filter((item) => item.paid > 0).length),
      kpi('Waiting to send', sum(queued), 'lkr0', { tone: queued.length > 0 ? 'warning' : 'success', note: `${queued.length} payout(s)` }),
      kpi('Failed transfers', sum(failed), 'lkr0', { tone: failed.length > 0 ? 'danger' : 'success', note: `${failed.length} payout(s)` }),
      kpi('Average payout', paid.length ? sum(paid) / paid.length : 0, 'lkr0'),
    ],
    highlights,
    sections: [
      section('Payouts by tutor', [
        table(
          [
            { key: 'tutor', label: 'Tutor' },
            { key: 'payouts', label: 'Payouts', format: 'number' },
            { key: 'paid', label: 'Paid', format: 'money' },
            { key: 'waiting', label: 'Waiting', format: 'money' },
            { key: 'failed', label: 'Failed', format: 'money' },
            { key: 'last', label: 'Last paid', format: 'date', width: 'auto' },
          ],
          tutorRows,
          { totals: ['payouts', 'paid', 'waiting', 'failed'], emptyText: 'No payouts in this period.' }
        ),
        bars('Amount paid to each tutor', tutorRows.map((item) => ({ label: item.tutor, value: item.paid })), 'money'),
      ]),
      section('Payout register', [
        table(
          [
            { key: 'paid_at', label: 'Date', format: 'date', width: 'auto' },
            { key: 'tutor_name', label: 'Tutor' },
            { key: 'period_label', label: 'For', width: 'auto' },
            { key: 'method', label: 'Method', format: 'label', width: 'auto' },
            { key: 'account', label: 'Paid to' },
            { key: 'provider_reference', label: 'Bank reference', width: 'auto' },
            { key: 'paid_by_name', label: 'Recorded by', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          payouts,
          { totals: ['amount'], emptyText: 'No payouts in this period.' }
        ),
        failed.length > 0
          ? table(
            [
              { key: 'paid_at', label: 'Date', format: 'date', width: 'auto' },
              { key: 'tutor_name', label: 'Tutor' },
              { key: 'failure_reason', label: 'Reason' },
              { key: 'amount', label: 'Amount', format: 'money' },
            ],
            failed,
            { title: 'Failed transfers' }
          )
          : null,
        signatures(),
      ], { intro: 'Account numbers show only the last four digits.' }),
    ],
  };
}

module.exports = { code: 'PAY', build };
