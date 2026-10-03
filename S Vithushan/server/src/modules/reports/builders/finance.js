// Fees & payments report - money in, money owed and every transaction
const parts = require('../reportParts');
const data = require('../reportData');

const { num, percent, change, kpi, table, bars, columnChart, facts, section, signatures, rows, one, money } = parts;

// fees and payments report - money in, money owed, tutor payouts and every transaction
async function build(params, { period }) {
  // fees collected in this period and in the one before it
  const collected = await data.getCollectedTotal(period);
  const previous = await data.getCollectedTotal(period.previous);
  // failed and refunded payments in the period
  const failed = await one(
    `SELECT SUM(status = 'FAILED') AS failed, SUM(status = 'REFUNDED') AS refunded,
            COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN amount END), 0) AS refunded_amount
     FROM payments WHERE COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ?`,
    [period.start, period.end]
  );
  // bank transfer slips waiting for verification
  const pending = await rows(
    `SELECT p.created_at, u.full_name, u.student_code, c.subject, p.amount,
            JSON_UNQUOTE(JSON_EXTRACT(p.payment_details, '$.bankReference')) AS reference
     FROM payments p
     JOIN users u ON u.id = p.student_id
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     WHERE p.status = 'PENDING' AND p.payment_method = 'BANK_TRANSFER'
     ORDER BY p.created_at ASC`
  );
  // total value of the waiting slips
  const pendingTotal = pending.reduce((sum, item) => sum + num(item.amount), 0);
  // every unpaid balance right now
  const outstanding = await rows(
    `SELECT u.full_name, u.student_code, u.phone, c.subject, e.balance
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     JOIN classes c ON c.id = e.class_id
     WHERE e.status = 'ACTIVE' AND e.balance > 0
     ORDER BY e.balance DESC, u.full_name`
  );
  // total unpaid
  const owedTotal = outstanding.reduce((sum, item) => sum + num(item.balance), 0);
  // money paid to tutors in the period
  const payouts = await data.getPayouts(period);
  // total paid to tutors
  const paidOut = payouts.filter(data.isPaid).reduce((sum, item) => sum + item.amount, 0);

  // fees by payment method
  const methods = await rows(
    `SELECT payment_method, COUNT(*) AS payments, SUM(amount) AS total
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY payment_method ORDER BY total DESC`,
    [period.start, period.end]
  );

  // daily bars for short periods, monthly for longer ones
  const daily = period.days <= 62;
  // fees collected per day or per month, for the chart
  const trendRows = await rows(
    `SELECT DATE_FORMAT(paid_at, '${daily ? '%Y-%m-%d' : '%Y-%m'}') AS bucket, SUM(amount) AS total
     FROM payments WHERE status = 'SUCCESSFUL' AND paid_at >= ? AND paid_at < ?
     GROUP BY bucket ORDER BY bucket`,
    [period.start, period.end]
  );
  const trendMap = new Map(trendRows.map((item) => [item.bucket, num(item.total)]));
  const trend = [];
  if (daily) {
    for (let day = period.from; day <= period.to; day = parts.addDays(day, 1)) {
      trend.push({ label: parts.formatDate(day).slice(0, 6), value: trendMap.get(day) || 0 });
    }
  } else {
    parts.monthKeys(period.from, period.to).forEach((key) => trend.push({ label: parts.monthLabel(key), value: trendMap.get(key) || 0 }));
  }

  // fees per class - collected in the period and still owed
  const classes = await data.getClasses();
  const collections = await data.getCollectionsByClass(period);
  const owedByClass = await data.getOutstandingByClass();
  // classes with payments or an unpaid balance, biggest first
  const classRows = classes
    .map((item) => ({
      subject: item.subject,
      tutor: item.tutor_name,
      payments: collections.get(item.id)?.payments || 0,
      collected: collections.get(item.id)?.collected || 0,
      owed: owedByClass.get(item.id)?.owed || 0,
    }))
    .filter((item) => item.payments > 0 || item.owed > 0)
    .sort((a, b) => b.collected - a.collected);

  // every payment in the period (the transaction register)
  const register = await rows(
    `SELECT COALESCE(p.paid_at, p.created_at) AS date, r.receipt_number, u.full_name, u.student_code, c.subject,
            p.payment_method, p.status, p.amount
     FROM payments p
     JOIN users u ON u.id = p.student_id
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE COALESCE(p.paid_at, p.created_at) >= ? AND COALESCE(p.paid_at, p.created_at) < ?
     ORDER BY date ASC, p.id ASC`,
    [period.start, period.end]
  );

  // change against the previous period
  const growth = change(collected.total, previous.total);
  // the key findings
  const highlights = [];
  highlights.push(
    growth === null
      ? `LKR ${money(collected.total)} was collected from ${collected.payments} payments.`
      : `LKR ${money(collected.total)} was collected from ${collected.payments} payments - ${growth >= 0 ? 'up' : 'down'} ${Math.abs(growth)}% on the previous period (LKR ${money(previous.total)}).`
  );
  if (methods.length > 0) {
    highlights.push(`${parts.label(methods[0].payment_method)} was the most used method (${percent(methods[0].total, collected.total)}% of the money).`);
  }
  if (pending.length > 0) highlights.push(`${pending.length} bank slip(s) worth LKR ${money(pendingTotal)} are waiting for verification.`);
  if (outstanding.length > 0) highlights.push(`LKR ${money(owedTotal)} is owed across ${outstanding.length} enrolment(s).`);
  highlights.push(`After LKR ${money(paidOut)} paid to tutors, the net amount for the period is LKR ${money(collected.total - paidOut)}.`);

  // the report - title, key figures, key findings and sections
  return {
    title: 'Fees & Payments Report',
    subtitle: 'Fees collected, money owed, tutor payouts and the full transaction register',
    orientation: 'landscape',
    filters: [{ label: 'Comparison period', value: period.previous.label }],
    summary: [
      kpi('Fees collected', collected.total, 'lkr0', { tone: 'success', note: `${collected.payments} payments` }),
      kpi('Previous period', previous.total, 'lkr0', { note: growth === null ? '' : `${growth >= 0 ? '+' : ''}${growth}% change` }),
      kpi('Awaiting verification', pendingTotal, 'lkr0', { tone: pending.length > 0 ? 'warning' : 'success', note: `${pending.length} bank slip(s)` }),
      kpi('Outstanding fees', owedTotal, 'lkr0', { tone: owedTotal > 0 ? 'warning' : 'success', note: `${outstanding.length} enrolment(s)` }),
      kpi('Paid to tutors', paidOut, 'lkr0'),
      kpi('Net after payouts', collected.total - paidOut, 'lkr0', { tone: collected.total - paidOut >= 0 ? 'success' : 'danger' }),
    ],
    highlights,
    sections: [
      section('Collections', [
        columnChart(daily ? 'Fees collected each day' : 'Fees collected each month', trend, 'money'),
        table(
          [
            { key: 'method', label: 'Payment method', format: 'label' },
            { key: 'payments', label: 'Payments', format: 'number' },
            { key: 'total', label: 'Amount', format: 'money' },
            { key: 'share', label: 'Share', format: 'percent' },
          ],
          methods.map((item) => ({ method: item.payment_method, payments: num(item.payments), total: num(item.total), share: percent(item.total, collected.total) })),
          { title: 'By payment method', totals: ['payments', 'total'], emptyText: 'No fees were collected in this period.' }
        ),
        bars('Share of fees by payment method', methods.map((item) => ({ label: parts.label(item.payment_method), value: num(item.total) })), 'money'),
        table(
          [
            { key: 'subject', label: 'Class' },
            { key: 'tutor', label: 'Tutor' },
            { key: 'payments', label: 'Payments', format: 'number' },
            { key: 'collected', label: 'Collected', format: 'money' },
            { key: 'owed', label: 'Outstanding today', format: 'money' },
          ],
          classRows,
          { title: 'By class', totals: ['payments', 'collected', 'owed'] }
        ),
        facts([
          { label: 'Failed payments', value: num(failed.failed), format: 'number' },
          { label: 'Refunded payments', value: `${num(failed.refunded)} (LKR ${money(failed.refunded_amount)})` },
        ]),
      ], { intro: `Only successful payments count as collected. Period: ${period.label}.` }),
      section('Bank slips awaiting verification', [
        table(
          [
            { key: 'created_at', label: 'Submitted', format: 'datetime', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'reference', label: 'Bank reference', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          pending,
          { totals: ['amount'], emptyText: 'No bank slips are waiting for verification.' }
        ),
      ], { intro: 'Every slip still waiting, whatever the date it was sent.' }),
      section('Outstanding balances', [
        table(
          [
            { key: 'full_name', label: 'Student' },
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'phone', label: 'Phone', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'balance', label: 'Balance', format: 'money' },
          ],
          outstanding,
          { totals: ['balance'], emptyText: 'No unpaid balances.' }
        ),
      ], { intro: 'Unpaid balances on active enrolments as of today, largest first.' }),
      section('Tutor payouts', [
        table(
          [
            { key: 'paid_at', label: 'Date', format: 'date', width: 'auto' },
            { key: 'tutor_name', label: 'Tutor' },
            { key: 'period_label', label: 'For', width: 'auto' },
            { key: 'account', label: 'Paid to' },
            { key: 'provider_reference', label: 'Bank reference', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          payouts,
          { totals: ['amount'], emptyText: 'No payouts in this period.' }
        ),
      ]),
      section('Transaction register', [
        table(
          [
            { key: 'date', label: 'Date', format: 'datetime', width: 'auto' },
            { key: 'receipt_number', label: 'Receipt', width: 'auto' },
            { key: 'full_name', label: 'Student' },
            { key: 'student_code', label: 'Code', width: 'auto' },
            { key: 'subject', label: 'Class' },
            { key: 'payment_method', label: 'Method', format: 'label', width: 'auto' },
            { key: 'status', label: 'Status', format: 'status', width: 'auto' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          register,
          { emptyText: 'No transactions in this period.' }
        ),
        signatures(),
      ], { intro: 'Every payment in the period, including pending, failed and refunded ones.', pageBreak: register.length > 20 }),
    ],
  };
}

module.exports = { code: 'FIN', build };
