// payment queries - balances, payments, receipts, bank details, tutor payouts and settings
const { pool } = require('../../../../../shared/server/src/config/db');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');

// one enrolment (a student in a class) with its balance and subject
async function findEnrollmentById(enrollmentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT e.id, e.student_id, e.class_id, e.balance, e.status, c.subject
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = ?
     LIMIT 1`,
    [enrollmentId]
  );
  return rows[0] || null;
}

// the same, but locked until the transaction ends so two payments cannot change the balance together
async function findEnrollmentByIdForUpdate(enrollmentId, connection) {
  const [rows] = await connection.execute(
    `SELECT e.id, e.student_id, e.class_id, e.balance, e.status, c.subject
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = ?
     FOR UPDATE`,
    [enrollmentId]
  );
  return rows[0] || null;
}

// what a student still owes on each active class
async function listBalancesForStudent(studentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT e.id AS enrollment_id, e.class_id, c.subject, e.balance, t.full_name AS tutor_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users t ON t.id = c.tutor_id
     WHERE e.student_id = ? AND e.status = 'ACTIVE'
     ORDER BY c.subject ASC`,
    [studentId]
  );
  return rows;
}

// update balance after payment (marks as paid)
async function updateEnrollmentBalance(enrollmentId, newBalance, executor = pool) {
  await executor.execute(
    `UPDATE enrollments SET balance = ?, payment_status = IF(? <= 0, 'PAID', 'UNPAID') WHERE id = ?`,
    [newBalance, newBalance, enrollmentId]
  );
}

// save a new payment as PENDING (the balance is unchanged until it succeeds)
async function createPendingPayment(
  { studentId, enrollmentId, amount, balanceBefore, paymentMethod, paymentDetails },
  executor = pool
) {
  const [result] = await executor.execute(
    `INSERT INTO payments
       (student_id, enrollment_id, amount, balance_before, balance_after,
        status, payment_method, payment_details, created_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW())`,
    [
      studentId,
      enrollmentId,
      amount,
      balanceBefore,
      balanceBefore,
      paymentMethod,
      JSON.stringify(paymentDetails || {}),
    ]
  );
  return result.insertId;
}

// mark a payment SUCCESSFUL with its gateway id, the balance after and the paid time
async function markPaymentSuccessful(
  paymentId,
  { gatewayTransactionId, balanceAfter },
  executor = pool
) {
  await executor.execute(
    `UPDATE payments
     SET status = 'SUCCESSFUL', gateway_transaction_id = ?, balance_after = ?, paid_at = NOW()
     WHERE id = ?`,
    [gatewayTransactionId, balanceAfter, paymentId]
  );
}

// approve slip - uses the amount admin read off the slip
async function approveBankTransfer(
  paymentId,
  { amount, balanceBefore, balanceAfter, gatewayTransactionId, paymentDetails },
  executor = pool
) {
  await executor.execute(
    `UPDATE payments
     SET status = 'SUCCESSFUL', amount = ?, balance_before = ?, balance_after = ?,
         gateway_transaction_id = ?, payment_details = ?, paid_at = NOW()
     WHERE id = ?`,
    [amount, balanceBefore, balanceAfter, gatewayTransactionId, JSON.stringify(paymentDetails || {}), paymentId]
  );
}

// mark a payment FAILED
async function markPaymentFailed(paymentId, { gatewayTransactionId }, executor = pool) {
  await executor.execute(
    `UPDATE payments SET status = 'FAILED', gateway_transaction_id = ? WHERE id = ?`,
    [gatewayTransactionId, paymentId]
  );
}

// edit btn - update a pending bank transfer's reference/receipt
async function updatePaymentDetails(paymentId, paymentDetails, executor = pool) {
  await executor.execute(`UPDATE payments SET payment_details = ? WHERE id = ?`, [
    JSON.stringify(paymentDetails),
    paymentId,
  ]);
}

// save the method the payer actually used
async function updatePaymentMethodAndDetails(
  paymentId,
  { paymentMethod, paymentDetails },
  executor = pool
) {
  await executor.execute(
    `UPDATE payments SET payment_method = ?, payment_details = ? WHERE id = ?`,
    [paymentMethod, JSON.stringify(paymentDetails || {}), paymentId]
  );
}

// save the receipt number for a payment
async function createReceipt(paymentId, receiptNumber, executor = pool) {
  await executor.execute(
    `INSERT INTO receipts (payment_id, receipt_number, issued_at) VALUES (?, ?, NOW())`,
    [paymentId, receiptNumber]
  );
}

// one payment by id
async function findPaymentById(paymentId, executor = pool) {
  const [rows] = await executor.execute(`SELECT * FROM payments WHERE id = ? LIMIT 1`, [
    paymentId,
  ]);
  return rows[0] || null;
}

// FOR UPDATE locks the row so two simultaneous retries can't both succeed.
async function findPaymentByIdForUpdate(paymentId, connection) {
  const [rows] = await connection.execute(`SELECT * FROM payments WHERE id = ? FOR UPDATE`, [
    paymentId,
  ]);
  return rows[0] || null;
}

// bank transfers waiting for admin approval, oldest first
async function listPendingBankTransfers(executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.enrollment_id, p.amount, p.balance_before, p.payment_details, p.created_at,
            e.balance AS current_balance, u.full_name AS student_name, u.email AS student_email,
            u.student_code, c.subject
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = p.student_id
     WHERE p.payment_method = 'BANK_TRANSFER' AND p.status = 'PENDING'
     ORDER BY p.created_at ASC`
  );
  return rows;
}

// One payment with everything the receipt screen needs
async function findPaymentWithDetailsById(paymentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.student_id, p.enrollment_id, c.subject, p.amount, p.balance_before,
            p.balance_after, p.status, p.payment_method, p.payment_details,
            p.gateway_transaction_id, p.created_at, p.paid_at,
            r.receipt_number, r.issued_at AS receipt_issued_at
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE p.id = ?
     LIMIT 1`,
    [paymentId]
  );
  return rows[0] || null;
}

// a student's payments with receipt numbers, newest first
async function listPaymentHistoryForStudent(studentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.enrollment_id, c.subject, p.amount, p.balance_before, p.balance_after,
            p.status, p.payment_method, p.payment_details, p.gateway_transaction_id, p.created_at, p.paid_at,
            r.receipt_number, r.issued_at AS receipt_issued_at
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE p.student_id = ?
     ORDER BY p.created_at DESC`,
    [studentId]
  );
  return rows;
}

// admin dashboard - recent payments
async function listRecentPayments(limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  const [rows] = await pool.query(
    `SELECT p.id, p.amount, p.status, p.payment_method, p.created_at, p.paid_at,
            u.full_name AS student_name, u.student_code, c.subject
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = p.student_id
     ORDER BY p.created_at DESC
     LIMIT ${safeLimit}`
  );
  return rows;
}

// notify everyone who needs to react to a payment event
async function createNotification({ recipientId, type, message, sentBy }) {
  await pool.execute(
    `INSERT INTO notification_log (recipient_id, channel, type, message, sent_by, sent_at)
     VALUES (?, 'EMAIL', ?, ?, ?, NOW())`,
    [recipientId, type, message, sentBy || null]
  );
}

// admin record payment - find students by registration number, name or email
async function searchStudents(term) {
  const like = `%${term}%`;
  const [rows] = await pool.execute(
    `SELECT id, full_name, student_code, grade, email FROM users
     WHERE role = 'STUDENT_PARENT' AND status = 'ACTIVE'
       AND (student_code LIKE ? OR full_name LIKE ? OR email LIKE ?)
     ORDER BY (student_code = ?) DESC, full_name
     LIMIT 10`,
    [like, like, like, term]
  );
  return rows;
}

// the active classes (with balance) of several students at once
async function listActiveEnrollmentsForStudents(studentIds) {
  if (studentIds.length === 0) return [];
  const [rows] = await pool.execute(
    `SELECT e.id, e.student_id, e.balance, c.subject, t.full_name AS tutor_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users t ON t.id = c.tutor_id
     WHERE e.status = 'ACTIVE' AND e.student_id IN (${studentIds.map(() => '?').join(', ')})
     ORDER BY c.subject`,
    studentIds
  );
  return rows;
}

// ids of the active admins - they are told about new bank transfers
async function findActiveAdminIds() {
  const [rows] = await pool.execute(`SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
  return rows.map((row) => row.id);
}

// --- Tutor payouts (Admin paying a Tutor their share/salary) ---

// tutor picker list
async function listActiveTutors() {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, profile_picture_path,
            bank_name, bank_account_holder, bank_account_number, bank_branch
     FROM users
     WHERE role = 'TUTOR' AND status = 'ACTIVE'
     ORDER BY full_name ASC`
  );
  return rows;
}

// tutor's own bank details - the full, unmasked record
async function findBankDetails(tutorId) {
  const [rows] = await pool.execute(
    `SELECT bank_name, bank_account_holder, bank_account_number, bank_branch
     FROM users WHERE id = ? AND role = 'TUTOR' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

// save a tutor's bank details
async function updateBankDetails(tutorId, { bankName, accountHolder, accountNumber, branch }) {
  await pool.execute(
    `UPDATE users
     SET bank_name = ?, bank_account_holder = ?, bank_account_number = ?, bank_branch = ?, updated_at = NOW()
     WHERE id = ? AND role = 'TUTOR'`,
    [bankName || null, accountHolder || null, accountNumber || null, branch || null, tutorId]
  );
}

// one active tutor by id
async function findActiveTutorById(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? AND role = 'TUTOR' AND status = 'ACTIVE' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

// The destination account is copied onto the payout row
async function createTutorPayout({
  tutorId,
  amount,
  note,
  periodLabel,
  paidBy,
  status,
  method,
  bankName,
  bankAccountHolder,
  bankAccountLast4,
  bankBranch,
  providerReference,
  settledAt,
}) {
  // before the database update only the basic columns exist
  if (!(await schema.hasPayoutTracking())) {
    const [legacy] = await pool.execute(
      `INSERT INTO tutor_payouts (tutor_id, amount, note, period_label, paid_by, paid_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [tutorId, amount, note || null, periodLabel || null, paidBy, settledAt || null]
    );
    return legacy.insertId;
  }

  const isSettled = status === 'SENT';
  const [result] = await pool.execute(
    `INSERT INTO tutor_payouts
       (tutor_id, amount, status, method, bank_name, bank_account_holder, bank_account_last4,
        bank_branch, provider_reference, settled_at, note, period_label, paid_by, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?, COALESCE(?, NOW()), NULL), ?, ?, ?, NOW())`,
    [
      tutorId,
      amount,
      status || 'RECORDED',
      method || 'MANUAL',
      bankName || null,
      bankAccountHolder || null,
      bankAccountLast4 || null,
      bankBranch || null,
      providerReference || null,
      isSettled ? 1 : 0,
      settledAt || null,
      note || null,
      periodLabel || null,
      paidBy,
    ]
  );
  return result.insertId;
}

// one payout with the tutor's name
async function findTutorPayoutById(payoutId) {
  const [rows] = await pool.execute(
    `SELECT tp.*, t.full_name AS tutor_name
     FROM tutor_payouts tp
     JOIN users t ON t.id = tp.tutor_id
     WHERE tp.id = ?
     LIMIT 1`,
    [payoutId]
  );
  return rows[0] || null;
}

// Queued payouts joined to the tutor's CURRENT full account number
async function listPayoutsAwaitingTransfer() {
  if (!(await schema.hasPayoutTracking())) return [];
  const [rows] = await pool.execute(
    `SELECT tp.id, tp.tutor_id, t.full_name AS tutor_name, tp.amount, tp.period_label,
            tp.note, tp.exported_at, tp.paid_at,
            t.bank_name, t.bank_account_holder, t.bank_account_number, t.bank_branch
     FROM tutor_payouts tp
     JOIN users t ON t.id = tp.tutor_id
     WHERE tp.status = 'QUEUED'
     ORDER BY tp.paid_at ASC`
  );
  return rows;
}

// mark queued payouts as put into a bank file
async function markPayoutsExported(payoutIds) {
  if (!payoutIds.length) return 0;
  const placeholders = payoutIds.map(() => '?').join(', ');
  const [result] = await pool.execute(
    `UPDATE tutor_payouts SET exported_at = NOW()
     WHERE id IN (${placeholders}) AND status = 'QUEUED'`,
    payoutIds
  );
  return result.affectedRows;
}

// mark a payout SENT with the bank reference (only from QUEUED or FAILED)
async function markPayoutSent(payoutId, providerReference, settledAt) {
  const [result] = await pool.execute(
    `UPDATE tutor_payouts
     SET status = 'SENT', provider_reference = ?, failure_reason = NULL, settled_at = COALESCE(?, NOW())
     WHERE id = ? AND status IN ('QUEUED', 'FAILED')`,
    [providerReference || null, settledAt || null, payoutId]
  );
  return result.affectedRows > 0;
}

// mark a payout FAILED with the reason (only from QUEUED or SENT)
async function markPayoutFailed(payoutId, reason) {
  const [result] = await pool.execute(
    `UPDATE tutor_payouts SET status = 'FAILED', failure_reason = ?
     WHERE id = ? AND status IN ('QUEUED', 'SENT')`,
    [String(reason || 'Transfer failed.').slice(0, 255), payoutId]
  );
  return result.affectedRows > 0;
}

// all payouts, newest first - uses the older columns when the database update has not been run
async function listTutorPayouts() {
  if (!(await schema.hasPayoutTracking())) {
    const [legacyRows] = await pool.execute(
      `SELECT tp.id, tp.tutor_id, t.full_name AS tutor_name, tp.amount, tp.note, tp.period_label,
              tp.paid_by, a.full_name AS paid_by_name, tp.paid_at
       FROM tutor_payouts tp
       JOIN users t ON t.id = tp.tutor_id
       JOIN users a ON a.id = tp.paid_by
       ORDER BY tp.paid_at DESC`
    );
    return legacyRows;
  }
  const [rows] = await pool.execute(
    `SELECT tp.id, tp.tutor_id, t.full_name AS tutor_name, tp.amount, tp.note, tp.period_label,
            tp.status, tp.method, tp.bank_name, tp.bank_account_holder, tp.bank_account_last4,
            tp.bank_branch, tp.provider_reference, tp.failure_reason, tp.exported_at,
            tp.settled_at, tp.paid_by, a.full_name AS paid_by_name, tp.paid_at
     FROM tutor_payouts tp
     JOIN users t ON t.id = tp.tutor_id
     JOIN users a ON a.id = tp.paid_by
     ORDER BY tp.paid_at DESC`
  );
  return rows;
}

// Per tutor: total paid, paid this month, and the last payment date
async function sumPayoutsByTutor() {
  const tracking = await schema.hasPayoutTracking();
  const paidOn = tracking ? 'COALESCE(settled_at, paid_at)' : 'paid_at';
  const statusFilter = tracking ? `WHERE status IN ('SENT', 'RECORDED')` : '';
  const [rows] = await pool.execute(
    `SELECT tutor_id,
            COALESCE(SUM(amount), 0) AS total_paid,
            COALESCE(SUM(CASE WHEN ${paidOn} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN amount ELSE 0 END), 0) AS month_paid,
            MAX(${paidOn}) AS last_paid_at
     FROM tutor_payouts
     ${statusFilter}
     GROUP BY tutor_id`
  );
  return rows;
}

// --- Institute payment settings (Admin-editable, shown to students at checkout) ---

// the institute's bank and wallet details (a single row)
async function getPaymentSettings() {
  const [rows] = await pool.execute(`SELECT * FROM payment_settings WHERE id = 1 LIMIT 1`);
  return rows[0] || null;
}

// save the institute's receiving details - creates the row the first time
async function upsertPaymentSettings(
  { bankName, bankAccountName, bankAccountNumber, bankBranch, bankSwift, ezCashNumber, mcashNumber },
  updatedBy
) {
  await pool.execute(
    `INSERT INTO payment_settings
       (id, bank_name, bank_account_name, bank_account_number, bank_branch, bank_swift,
        ez_cash_number, mcash_number, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       bank_name = VALUES(bank_name),
       bank_account_name = VALUES(bank_account_name),
       bank_account_number = VALUES(bank_account_number),
       bank_branch = VALUES(bank_branch),
       bank_swift = VALUES(bank_swift),
       ez_cash_number = VALUES(ez_cash_number),
       mcash_number = VALUES(mcash_number),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [
      bankName || null,
      bankAccountName || null,
      bankAccountNumber || null,
      bankBranch || null,
      bankSwift || null,
      ezCashNumber || null,
      mcashNumber || null,
      updatedBy,
    ]
  );
}

// payment methods the admin switched on - kept as the latest PAYMENT_METHODS_SET entry in audit_log
async function findEnabledMethods() {
  const [rows] = await pool.execute(
    `SELECT details FROM audit_log WHERE action = 'PAYMENT_METHODS_SET' ORDER BY id DESC LIMIT 1`
  );
  if (!rows[0]) return null;
  const details = typeof rows[0].details === 'string' ? JSON.parse(rows[0].details) : rows[0].details;
  return details && Array.isArray(details.methods) ? details.methods : null;
}

// remember which payment methods are switched on (kept as an audit log entry)
async function saveEnabledMethods(methods, adminId) {
  await pool.execute(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
     VALUES (?, 'PAYMENT_METHODS_SET', 'payment_settings', 1, ?, NOW())`,
    [adminId, JSON.stringify({ methods })]
  );
}

module.exports = {
  findEnabledMethods,
  saveEnabledMethods,
  searchStudents,
  listActiveEnrollmentsForStudents,
  findEnrollmentById,
  findEnrollmentByIdForUpdate,
  listBalancesForStudent,
  updateEnrollmentBalance,
  createPendingPayment,
  markPaymentSuccessful,
  approveBankTransfer,
  markPaymentFailed,
  updatePaymentDetails,
  updatePaymentMethodAndDetails,
  createReceipt,
  findPaymentById,
  findPaymentByIdForUpdate,
  findPaymentWithDetailsById,
  listPendingBankTransfers,
  listPaymentHistoryForStudent,
  listRecentPayments,
  createNotification,
  findActiveAdminIds,
  listActiveTutors,
  findBankDetails,
  updateBankDetails,
  getPaymentSettings,
  upsertPaymentSettings,
  findActiveTutorById,
  createTutorPayout,
  findTutorPayoutById,
  listPayoutsAwaitingTransfer,
  markPayoutsExported,
  markPayoutSent,
  markPayoutFailed,
  listTutorPayouts,
  sumPayoutsByTutor,
};
